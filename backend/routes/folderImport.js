// One-time folder import — copies local files into the active workspace DB (no disk sync).
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb, getActiveWorkspaceId } = require('../db/database');
const { extractPlainText } = require('../services/graphService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');

const router = express.Router();

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__']);

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

// Inserts a graph node and queues embedding — no LLM edges or workspace switching.
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

// POST /api/import/folder — import files into the currently active workspace only.
router.post('/folder', (req, res) => {
  try {
    const { workspace_id, root_path, created_by } = req.body || {};
    if (!workspace_id || !root_path) {
      return res.status(400).json({ error: 'workspace_id and root_path are required' });
    }

    const activeId = getActiveWorkspaceId();
    if (!activeId) {
      return res.status(400).json({ error: 'No active workspace. Open or create a workspace first.' });
    }
    if (activeId !== workspace_id) {
      return res.status(400).json({ error: 'workspace_id does not match the active workspace' });
    }

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
    const filePaths = walkDir(resolvedRoot);

    let documents = 0;
    let code = 0;
    let skipped = 0;
    const errors = [];

    for (const filePath of filePaths) {
      const kind = getFileKind(filePath);
      if (!kind) {
        skipped += 1;
        continue;
      }

      const relativeTitle = path.relative(resolvedRoot, filePath).split(path.sep).join('/');
      let rawContent;
      try {
        rawContent = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        errors.push({ file: relativeTitle, error: err.message });
        continue;
      }

      const now = new Date().toISOString();

      try {
        if (kind === 'document') {
          const id = uuidv4();
          const content = markdownToTipTap(rawContent);
          db.prepare(
            `INSERT INTO documents
             (id, workspace_id, title, content, created_by, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(id, workspace_id, relativeTitle, content, createdBy, now, now);

          insertGraphNode(
            db,
            workspace_id,
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
          ).run(fileId, workspace_id, relativeTitle, rawContent, language, createdBy);

          const summary = extractPlainText(rawContent, 200);
          insertGraphNode(
            db,
            workspace_id,
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

    return res.json({
      success: true,
      documents,
      code,
      skipped,
      errors
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
