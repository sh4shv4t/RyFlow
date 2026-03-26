// Workspace management routes for local/remote session lifecycle and portability.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const unzipper = require('unzipper');
const archiver = require('archiver');
const Database = require('better-sqlite3');
const registry = require('../db/registry');
const {
  getDb,
  switchWorkspace,
  getWorkspaceDbPath,
  listLocalWorkspaceDbs,
  clearActiveWorkspace,
  DATA_DIR
} = require('../db/database');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');
const { buildEmbedText } = require('../services/embeddingService');

const router = express.Router();
const upload = multer({ dest: path.join(os.tmpdir(), 'ryflow_uploads') });

// Generates a 6-character uppercase alphanumeric join code.
function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Resolves package version from project root package file.
function getAppVersion() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Returns host LAN IPv4 address for peer connection metadata.
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

// Ensures join code uniqueness in registry by regenerating as needed.
function createUniqueJoinCode() {
  let code = generateJoinCode();
  while (registry.prepare('SELECT id FROM workspaces WHERE join_code = ?').get(code)) {
    code = generateJoinCode();
  }
  return code;
}

// Returns the currently active session row enriched with workspace details.
function getActiveSessionRecord() {
  return registry.prepare(
    `SELECT s.workspace_id, s.is_remote, s.remote_host, s.remote_port,
            w.name, w.description, w.owner_name, w.join_code, w.is_local
     FROM active_session s
     LEFT JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.id = 1`
  ).get();
}

// Opens a workspace db directly for read-only export operations.
function openWorkspaceDbForRead(workspaceId) {
  const dbPath = getWorkspaceDbPath(workspaceId);
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true });
  return db;
}

// Marks active session row to the provided workspace and mode.
function setActiveSession(workspaceId, isRemote, remoteHost = null, remotePort = null) {
  registry.prepare(
    `INSERT OR REPLACE INTO active_session
     (id, workspace_id, is_remote, remote_host, remote_port)
     VALUES (1, ?, ?, ?, ?)`
  ).run(workspaceId || null, isRemote ? 1 : 0, remoteHost, remotePort);
}

// Picks the most recently accessed local workspace with existing db file.
function getFallbackLocalWorkspace() {
  const rows = registry.prepare(
    `SELECT * FROM workspaces
     WHERE is_local = 1
     ORDER BY datetime(last_accessed) DESC, datetime(created_at) DESC`
  ).all();
  return rows.find((row) => fs.existsSync(getWorkspaceDbPath(row.id))) || null;
}

// GET /api/workspaces — list known local/remote workspaces from registry.
router.get('/', (req, res) => {
  try {
    const localDbSet = new Set(listLocalWorkspaceDbs());
    const workspaces = registry.prepare(
      `SELECT id, name, description, owner_name, join_code, is_local, host_ip, host_port, last_accessed, created_at
       FROM workspaces
       ORDER BY datetime(last_accessed) DESC, datetime(created_at) DESC`
    ).all().map((ws) => ({
      ...ws,
      orphaned: ws.is_local ? !localDbSet.has(ws.id) : false
    }));

    return res.json({ workspaces });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/workspaces/active — returns active workspace session details.
router.get('/active', (req, res) => {
  try {
    const active = getActiveSessionRecord();
    if (!active?.workspace_id) return res.json({ active: null });
    return res.json({
      active: {
        workspace_id: active.workspace_id,
        name: active.name,
        description: active.description,
        owner_name: active.owner_name,
        join_code: active.join_code,
        is_remote: Boolean(active.is_remote),
        remote_host: active.remote_host,
        remote_port: active.remote_port,
        is_local: Number(active.is_local || 0)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/workspaces/discover — open lobby metadata for LAN discovery.
router.get('/discover', (req, res) => {
  try {
    const active = getActiveSessionRecord();
    if (!active?.workspace_id) {
      return res.status(404).json({ error: 'No active workspace hosted' });
    }

    return res.json({
      workspace_id: active.workspace_id,
      workspace_name: active.name,
      owner_name: active.owner_name || 'Unknown',
      host_ip: getLocalIP(),
      host_port: Number(process.env.PORT || 3001),
      version: getAppVersion()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/create — creates a new local workspace and switches to it.
router.post('/create', (req, res) => {
  try {
    const { name, description, owner_name } = req.body || {};
    if (!String(name || '').trim() || !String(owner_name || '').trim()) {
      return res.status(400).json({ error: 'name and owner_name are required' });
    }

    const workspaceId = crypto.randomUUID();
    const joinCode = createUniqueJoinCode();

    registry.prepare(
      `INSERT INTO workspaces
       (id, name, description, owner_name, join_code, is_local, host_ip, host_port)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(workspaceId, String(name).trim(), String(description || '').trim() || null, String(owner_name).trim(), joinCode, getLocalIP(), Number(process.env.PORT || 3001));

    switchWorkspace(workspaceId);
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)').run(workspaceId, String(name).trim());
    db.prepare(
      'INSERT OR IGNORE INTO users (id, name, workspace_id, avatar_color, language) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), String(owner_name).trim(), workspaceId, '#E8000D', 'en');

    setActiveSession(workspaceId, false, null, null);
    registry.prepare('UPDATE workspaces SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(workspaceId);

    const workspace = registry.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
    return res.status(201).json({ workspace, join_code: joinCode });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/switch — switches active session to a local workspace.
router.post('/switch', (req, res) => {
  try {
    const { workspace_id } = req.body || {};
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const workspace = registry.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspace_id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    if (Number(workspace.is_local) === 1) {
      switchWorkspace(workspace_id);
      setActiveSession(workspace_id, false, null, null);
    } else {
      setActiveSession(workspace_id, true, workspace.host_ip, workspace.host_port);
    }

    registry.prepare('UPDATE workspaces SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(workspace_id);
    return res.json({ success: true, workspace });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/join-remote — validates and starts remote workspace session.
router.post('/join-remote', async (req, res) => {
  try {
    const { host_ip, host_port, join_code } = req.body || {};
    if (!host_ip || !host_port || !join_code) {
      return res.status(400).json({ error: 'host_ip, host_port, and join_code are required' });
    }

    let workspaceInfo;
    try {
      const discoverRes = await fetch(`http://${host_ip}:${host_port}/api/workspaces/discover`);
      if (!discoverRes.ok) {
        return res.status(400).json({ error: 'Host not reachable' });
      }
      workspaceInfo = await discoverRes.json();
    } catch {
      return res.status(400).json({ error: 'Host not reachable' });
    }

    try {
      const verifyRes = await fetch(`http://${host_ip}:${host_port}/api/workspace`, {
        headers: { 'x-join-code': String(join_code).toUpperCase() }
      });
      if (verifyRes.status === 403) {
        return res.status(403).json({ error: 'Invalid join code' });
      }
      if (!verifyRes.ok) {
        return res.status(502).json({ error: 'Unable to verify remote workspace' });
      }
    } catch (err) {
      return res.status(502).json({ error: 'Host not reachable', detail: err.message });
    }

    registry.prepare(
      `INSERT OR IGNORE INTO workspaces
       (id, name, owner_name, join_code, is_local, host_ip, host_port)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    ).run(
      workspaceInfo.workspace_id,
      workspaceInfo.workspace_name || 'Remote Workspace',
      workspaceInfo.owner_name || 'Unknown',
      String(join_code).toUpperCase(),
      host_ip,
      Number(host_port)
    );

    setActiveSession(workspaceInfo.workspace_id, true, host_ip, Number(host_port));
    registry.prepare('UPDATE workspaces SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(workspaceInfo.workspace_id);

    return res.json({ success: true, workspace: workspaceInfo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workspaces/disconnect-remote — exits remote mode and falls back to local workspace.
router.post('/disconnect-remote', (req, res) => {
  try {
    const fallback = getFallbackLocalWorkspace();
    if (fallback) {
      switchWorkspace(fallback.id);
      setActiveSession(fallback.id, false, null, null);
      registry.prepare('UPDATE workspaces SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(fallback.id);
      return res.json({ success: true, workspace: fallback });
    }

    clearActiveWorkspace();
    setActiveSession(null, false, null, null);
    return res.json({ success: true, workspace: null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workspaces/:id — removes workspace from registry and local db file when present.
router.delete('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const workspace = registry.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const active = getActiveSessionRecord();
    if (active?.workspace_id === id) {
      clearActiveWorkspace();
      setActiveSession(null, false, null, null);
    }

    if (Number(workspace.is_local) === 1) {
      const dbPath = getWorkspaceDbPath(id);
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }

    registry.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Exports workspace data as zip stream or JSON payload.
function handleWorkspaceExport(req, res) {
  try {
    const id = req.params.id;
    const format = String(req.query.format || 'zip').toLowerCase();
    const workspace = registry.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    if (!workspace) return res.status(404).json({ error: 'Not found' });

    const db = openWorkspaceDbForRead(id);
    if (!db) return res.status(404).json({ error: 'Workspace database missing' });

    const manifest = {
      ryflow_version: getAppVersion(),
      export_date: new Date().toISOString(),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        owner_name: workspace.owner_name,
        created_at: workspace.created_at
      }
    };

    if (format === 'json') {
      const payload = {
        manifest,
        documents: db.prepare('SELECT * FROM documents').all(),
        tasks: db.prepare('SELECT * FROM tasks').all(),
        code_files: db.prepare('SELECT * FROM code_files').all(),
        canvases: db.prepare('SELECT * FROM canvases').all(),
        ai_chats: db.prepare('SELECT * FROM ai_chats').all(),
        nodes: db.prepare('SELECT * FROM nodes').all(),
        edges: db.prepare('SELECT * FROM edges').all(),
        tags: db.prepare('SELECT * FROM tags').all(),
        node_tags: db.prepare('SELECT * FROM node_tags').all()
      };
      db.close();
      return res.json(payload);
    }

    const filename = `ryflow_${String(workspace.name || 'workspace').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.ryflow`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    archive.pipe(res);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.file(getWorkspaceDbPath(id), { name: 'workspace.db' });

    const embeddings = db.prepare(
      'SELECT id, title, type, embedding FROM nodes WHERE embedding IS NOT NULL'
    ).all();
    db.close();
    archive.append(JSON.stringify(embeddings), { name: 'embeddings.json' });

    const uploadsDir = path.join(DATA_DIR, '..', 'uploads', id);
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }

    archive.finalize().catch(() => {});
    return undefined;
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/workspaces/:id/export — exports workspace as downloadable .ryflow archive.
router.post('/:id/export', (req, res) => {
  req.query.format = 'zip';
  return handleWorkspaceExport(req, res);
});

// GET /api/workspaces/:id/export?format=json — exports workspace as inspectable JSON payload.
router.get('/:id/export', (req, res) => handleWorkspaceExport(req, res));

// POST /api/workspaces/import — imports .ryflow zip or JSON payload into a new workspace.
router.post('/import', upload.single('file'), async (req, res) => {
  const uploadedFile = req.file;
  if (!uploadedFile) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const tempDir = path.join(os.tmpdir(), `ryflow_import_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const fileName = String(uploadedFile.originalname || '').toLowerCase();
    let manifest = null;
    let oldId = null;

    const newWorkspaceId = crypto.randomUUID();
    const newJoinCode = createUniqueJoinCode();

    if (fileName.endsWith('.json')) {
      const raw = fs.readFileSync(uploadedFile.path, 'utf8');
      const parsed = JSON.parse(raw);
      manifest = parsed.manifest || {
        workspace: { id: newWorkspaceId, name: 'Imported Workspace', owner_name: 'Unknown', created_at: new Date().toISOString() }
      };

      switchWorkspace(newWorkspaceId);
      const db = getDb();
      const tables = ['documents', 'tasks', 'code_files', 'canvases', 'ai_chats', 'nodes', 'edges', 'tags', 'node_tags'];
      db.exec('BEGIN');
      try {
        db.prepare('INSERT OR REPLACE INTO workspaces (id, name) VALUES (?, ?)').run(newWorkspaceId, `${manifest.workspace?.name || 'Imported'} (Imported)`);
        tables.forEach((table) => {
          const rows = Array.isArray(parsed[table]) ? parsed[table] : [];
          if (!rows.length) return;
          const cols = Object.keys(rows[0]);
          const placeholders = cols.map(() => '?').join(',');
          const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
          rows.forEach((row) => {
            const values = cols.map((col) => row[col]);
            try {
              stmt.run(...values);
            } catch {
              // Skip conflicting/invalid rows during JSON import.
            }
          });
        });
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      oldId = manifest.workspace?.id || null;
    } else {
      await fs.createReadStream(uploadedFile.path)
        .pipe(unzipper.Extract({ path: tempDir }))
        .promise();

      manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf8'));
      oldId = manifest.workspace?.id;

      const sourceDb = path.join(tempDir, 'workspace.db');
      const destDb = getWorkspaceDbPath(newWorkspaceId);
      fs.copyFileSync(sourceDb, destDb);

      const sourceUploads = path.join(tempDir, 'uploads');
      if (fs.existsSync(sourceUploads)) {
        const destUploads = path.join(DATA_DIR, '..', 'uploads', newWorkspaceId);
        fs.mkdirSync(destUploads, { recursive: true });
        fs.cpSync(sourceUploads, destUploads, { recursive: true });
      }

      switchWorkspace(newWorkspaceId);
    }

    const db = getDb();
    if (oldId && oldId !== newWorkspaceId) {
      db.prepare('UPDATE workspaces SET id = ? WHERE id = ?').run(newWorkspaceId, oldId);
      db.prepare('UPDATE documents SET workspace_id = ? WHERE workspace_id = ?').run(newWorkspaceId, oldId);
      db.prepare('UPDATE tasks SET workspace_id = ? WHERE workspace_id = ?').run(newWorkspaceId, oldId);
      db.prepare('UPDATE nodes SET workspace_id = ? WHERE workspace_id = ?').run(newWorkspaceId, oldId);
      db.prepare('UPDATE code_files SET workspace_id = ? WHERE workspace_id = ?').run(newWorkspaceId, oldId);
      db.prepare('UPDATE canvases SET workspace_id = ? WHERE workspace_id = ?').run(newWorkspaceId, oldId);
      db.prepare('UPDATE ai_chats SET workspace_id = ? WHERE workspace_id = ?').run(newWorkspaceId, oldId);
      db.prepare('UPDATE tags SET workspace_id = ? WHERE workspace_id = ?').run(newWorkspaceId, oldId);
    }

    db.prepare('INSERT OR REPLACE INTO workspaces (id, name) VALUES (?, ?)').run(
      newWorkspaceId,
      `${manifest.workspace?.name || 'Imported Workspace'} (Imported)`
    );

    registry.prepare(
      `INSERT INTO workspaces
       (id, name, description, owner_name, join_code, is_local, created_at, host_ip, host_port)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      newWorkspaceId,
      `${manifest.workspace?.name || 'Imported Workspace'} (Imported)`,
      manifest.workspace?.description || `Imported from ${manifest.workspace?.owner_name || 'Unknown'}`,
      manifest.workspace?.owner_name || 'Unknown',
      newJoinCode,
      manifest.workspace?.created_at || new Date().toISOString(),
      getLocalIP(),
      Number(process.env.PORT || 3001)
    );

    setActiveSession(newWorkspaceId, false, null, null);
    registry.prepare('UPDATE workspaces SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(newWorkspaceId);

    const nodes = db.prepare('SELECT id, title, type, content_summary, metadata FROM nodes WHERE workspace_id = ?').all(newWorkspaceId);
    nodes.forEach((node) => {
      enqueueEmbeddingJob(node.id, buildEmbedText(node));
    });

    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.unlinkSync(uploadedFile.path);

    return res.json({
      success: true,
      workspace: {
        id: newWorkspaceId,
        name: `${manifest.workspace?.name || 'Imported Workspace'} (Imported)`,
        join_code: newJoinCode,
        original_owner: manifest.workspace?.owner_name || 'Unknown',
        original_date: manifest.workspace?.created_at || null,
        node_count: nodes.length
      }
    });
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    try { fs.unlinkSync(uploadedFile.path); } catch {}
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
