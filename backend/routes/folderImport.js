// One-time import — local folders or git clones into the active workspace DB (no disk sync).
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getDb, getActiveWorkspaceId } = require('../db/database');
const { extractPlainText } = require('../services/graphService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');

const router = express.Router();

const MAX_FILE_BYTES = 1024 * 1024;
const GIT_CLONE_TIMEOUT_MS = 120000;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'venv', '.venv', 'coverage', '.cache', 'vendor'
]);

const EXT_TO_LANGUAGE = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'c',
  '.rs': 'rust',
  '.go': 'go',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.json': 'json'
};

function buildDocMetadata(content, lastEditor) {
  const text = String(content || '').replace(/<[^>]+>/g, ' ');
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { word_count: wordCount, last_editor: lastEditor || null };
}

function buildCodeMetadata(file) {
  return {
    language: file.language || 'javascript',
    line_count: String(file.content || '').split(/\r?\n/).length
  };
}

function resolveValidUserId(db, userId, workspaceId) {
  const candidate = String(userId || '').trim();
  if (!candidate) return null;
  const exists = db.prepare('SELECT id FROM users WHERE id = ? AND workspace_id = ? LIMIT 1').get(candidate, workspaceId);
  return exists?.id || null;
}

function assertActiveWorkspace(workspaceId) {
  const activeId = getActiveWorkspaceId();
  if (!activeId) {
    const err = new Error('No active workspace. Open or create a workspace first.');
    err.status = 400;
    throw err;
  }
  if (activeId !== workspaceId) {
    const err = new Error('workspace_id does not match the active workspace');
    err.status = 400;
    throw err;
  }
}

function getFileKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md') return 'document';
  if (EXT_TO_LANGUAGE[ext]) return 'code';
  return null;
}

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || 'javascript';
}

function markdownToTipTap(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const content = lines.map((line) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      return {
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: headingMatch[2] ? [{ type: 'text', text: headingMatch[2] }] : []
      };
    }
    return {
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : []
    };
  });
  return JSON.stringify({
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }]
  });
}

function walkDir(rootPath, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(rootPath, entry.name);
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkDir(fullPath, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (getFileKind(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readTextFileSafe(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  if (stat.size > MAX_FILE_BYTES) {
    return { ok: false, reason: 'File too large' };
  }

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  if (buffer.includes(0)) {
    return { ok: false, reason: 'Binary file' };
  }

  try {
    return { ok: true, content: buffer.toString('utf8') };
  } catch {
    return { ok: false, reason: 'Invalid UTF-8' };
  }
}

function insertGraphNode(db, workspaceId, type, title, contentSummary, sourceId, metadata) {
  const nodeId = uuidv4();
  const metadataText = metadata ? JSON.stringify(metadata) : null;
  const normalizedSummary = type === 'code'
    ? String(contentSummary || '').slice(0, 200)
    : extractPlainText(contentSummary, 200);

  db.prepare(
    'INSERT INTO nodes (id, workspace_id, type, title, content_summary, metadata, source_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
  ).run(nodeId, workspaceId, type, title, normalizedSummary || '', metadataText, sourceId);

  enqueueEmbeddingJob(nodeId, workspaceId);
}

function indexDirectory(db, workspaceId, rootPath, createdBy, { titlePrefix = '' } = {}) {
  const filePaths = walkDir(rootPath);
  const prefix = titlePrefix ? `${titlePrefix}/` : '';

  let documents = 0;
  let code = 0;
  let skipped = 0;
  const errors = [];

  for (const filePath of filePaths) {
    const kind = getFileKind(filePath);
    const relativeTitle = prefix + path.relative(rootPath, filePath).split(path.sep).join('/');

    if (!kind) {
      skipped += 1;
      continue;
    }

    const readResult = readTextFileSafe(filePath);
    if (!readResult.ok) {
      skipped += 1;
      errors.push({ file: relativeTitle, error: readResult.reason });
      continue;
    }

    const rawContent = readResult.content;
    const now = new Date().toISOString();

    try {
      if (kind === 'document') {
        const id = uuidv4();
        const content = markdownToTipTap(rawContent);
        db.prepare(
          `INSERT INTO documents
           (id, workspace_id, title, content, created_by, updated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, workspaceId, relativeTitle, content, createdBy, now, now);

        insertGraphNode(
          db,
          workspaceId,
          'document',
          relativeTitle,
          content,
          id,
          {
            ...buildDocMetadata(content, createdBy),
            is_daily_note: false,
            daily_note_date: null
          }
        );
        documents += 1;
      } else {
        const fileId = uuidv4();
        const language = detectLanguage(filePath);
        db.prepare(
          'INSERT INTO code_files (id, workspace_id, title, content, language, created_by) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(fileId, workspaceId, relativeTitle, rawContent, language, createdBy);

        const summary = extractPlainText(rawContent, 200);
        insertGraphNode(
          db,
          workspaceId,
          'code',
          `${relativeTitle} (${language})`,
          summary,
          fileId,
          buildCodeMetadata({ content: rawContent, language })
        );
        code += 1;
      }
    } catch (err) {
      errors.push({ file: relativeTitle, error: err.message });
    }
  }

  return { documents, code, skipped, errors };
}

function validateRepoUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  if (/[;&|`$<>]/.test(trimmed)) return null;

  const allowed = [
    /^https?:\/\/[^\s]+$/i,
    /^git@[^:\s]+:[^\s]+$/,
    /^git@[^/\s]+\/[^\s]+$/
  ];
  if (!allowed.some((pattern) => pattern.test(trimmed))) return null;
  return trimmed;
}

function deriveRepoName(repoUrl, cloneDir) {
  const folderName = path.basename(cloneDir);
  if (folderName && folderName !== 'repo') return folderName.replace(/\.git$/i, '');

  const cleaned = String(repoUrl).replace(/\.git$/i, '');
  const segment = cleaned.split('/').pop() || 'repository';
  return segment.replace(/:/g, '-');
}

function ensureGitAvailable() {
  const check = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (check.error || check.status !== 0) {
    const err = new Error('Git is not installed or not available on PATH');
    err.status = 400;
    throw err;
  }
}

function gitClone(repoUrl, destDir, branch) {
  const args = ['clone', '--depth', '1'];
  if (branch) {
    args.push('--branch', String(branch).trim(), '--single-branch');
  }
  args.push(repoUrl, destDir);

  const result = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: GIT_CLONE_TIMEOUT_MS,
    windowsHide: true
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      const err = new Error('Git is not installed or not available on PATH');
      err.status = 400;
      throw err;
    }
    const err = new Error(result.error.message || 'git clone failed');
    err.status = 400;
    throw err;
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    const err = new Error(detail || 'git clone failed');
    err.status = 400;
    throw err;
  }
}

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup for temp clone directories.
  }
}

// POST /api/import/folder — import files from a local directory.
router.post('/folder', (req, res) => {
  try {
    const { workspace_id, root_path, created_by } = req.body || {};
    if (!workspace_id || !root_path) {
      return res.status(400).json({ error: 'workspace_id and root_path are required' });
    }

    assertActiveWorkspace(workspace_id);

    const resolvedRoot = path.resolve(String(root_path));
    let stat;
    try {
      stat = fs.statSync(resolvedRoot);
    } catch {
      return res.status(400).json({ error: 'root_path does not exist' });
    }
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'root_path must be a directory' });
    }

    const db = getDb();
    const createdBy = resolveValidUserId(db, created_by, workspace_id);
    const result = indexDirectory(db, workspace_id, resolvedRoot, createdBy);

    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/import/git — shallow-clone a repo and index supported files.
router.post('/git', (req, res) => {
  const { workspace_id, repo_url, branch, created_by } = req.body || {};
  if (!workspace_id || !repo_url) {
    return res.status(400).json({ error: 'workspace_id and repo_url are required' });
  }

  const repoUrl = validateRepoUrl(repo_url);
  if (!repoUrl) {
    return res.status(400).json({ error: 'Invalid or unsupported repository URL' });
  }

  let tempDir;
  try {
    assertActiveWorkspace(workspace_id);
    ensureGitAvailable();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryflow_git_'));
    const cloneDir = path.join(tempDir, 'repo');

    gitClone(repoUrl, cloneDir, branch);

    const db = getDb();
    const createdBy = resolveValidUserId(db, created_by, workspace_id);
    const repoName = deriveRepoName(repoUrl, cloneDir);
    const result = indexDirectory(db, workspace_id, cloneDir, createdBy, { titlePrefix: repoName });

    return res.json({
      success: true,
      repo: repoName,
      ...result
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  } finally {
    if (tempDir) removeDirSafe(tempDir);
  }
});

module.exports = router;
