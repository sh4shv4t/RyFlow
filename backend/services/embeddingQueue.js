'use strict';

// Lazy-require to avoid circular deps at module load
const getOllama = () => require('./ollamaService');
const getDatabase = () => require('../db/database');
const getHnswIndex = () => require('./hnswIndex');

const queue = [];
let processing = false;
let consecutiveFails = 0;

// Permanently skip nodes that have failed
const blacklist = new Set();

function enqueue(nodeId, workspaceId) {
  if (!nodeId || typeof nodeId !== 'string') return;
  if (!workspaceId || typeof workspaceId !== 'string') return;
  if (blacklist.has(nodeId)) return;
  // Deduplicate
  if (queue.some(j => j.nodeId === nodeId)) return;
  queue.push({ nodeId, workspaceId });
  if (!processing) scheduleNext(0);
}

function scheduleNext(delayMs) {
  setTimeout(tick, delayMs);
}

async function tick() {
  if (queue.length === 0) {
    processing = false;
    return;
  }

  // Back off if Ollama keeps failing
  if (consecutiveFails >= 3) {
    processing = false;
    console.log('[Embedding] Backing off 30s - Ollama may be unavailable');
    setTimeout(() => {
      consecutiveFails = 0;
      if (queue.length > 0) scheduleNext(0);
    }, 30000);
    return;
  }

  processing = true;
  const job = queue.shift();
  const { nodeId } = job;

  try {
    // Get DB connection safely
    let db;
    try {
      db = getDatabase().getDb();
    } catch {
      // No active DB - skip this job permanently
      blacklist.add(nodeId);
      scheduleNext(100);
      return;
    }

    // Fetch node - may be null if deleted
    const node = db.prepare(
      'SELECT id, title, type, content_summary, metadata FROM nodes WHERE id = ?'
    ).get(nodeId);

    // Node gone - blacklist and move on silently
    if (!node) {
      blacklist.add(nodeId);
      consecutiveFails = 0;
      scheduleNext(50);
      return;
    }

    // Build embed text WITHOUT using buildEmbedText
    // to avoid any import issues or null crashes
    const meta = (() => {
      if (!node.metadata) return {};
      try { return JSON.parse(node.metadata); }
      catch { return {}; }
    })();

    const parts = [
      node.type && `Type: ${node.type}`,
      node.title && `Title: ${node.title}`,
      node.content_summary && `Content: ${node.content_summary}`,
      meta.priority && `Priority: ${meta.priority}`,
      meta.language && `Language: ${meta.language}`,
      meta.assignee && `Assignee: ${meta.assignee}`,
    ].filter(Boolean);

    const text = parts.join('. ');

    if (!text.trim()) {
      // Nothing to embed - skip silently
      consecutiveFails = 0;
      scheduleNext(50);
      return;
    }

    // Call Ollama
    const ollama = getOllama();
    const embedding = await ollama.embed(text);

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      // Ollama returned nothing - retry later
      consecutiveFails++;
      queue.unshift(job); // put back at front
      scheduleNext(3000);
      return;
    }

    // Success
    consecutiveFails = 0;

    // Store as binary buffer (4 bytes per float)
    const buf = Buffer.allocUnsafe(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buf.writeFloatLE(embedding[i], i * 4);
    }

    db.prepare('UPDATE nodes SET embedding = ? WHERE id = ?').run(buf, nodeId);

    // Update HNSW index with the new embedding (best-effort; never blocks the queue).
    try {
      const hnswIdx = getHnswIndex();
      hnswIdx.upsert(job.workspaceId, nodeId, embedding);

      // Auto-create semantic edges for any node with cosine similarity >= 0.82.
      // This populates the 'semantic' edge type visible in the graph.
      const similar = hnswIdx.findSimilar(job.workspaceId, embedding, 6, 0.82);
      if (similar.length > 0) {
        const { v4: uuidv4 } = require('uuid');
        const checkEdge = db.prepare(
          'SELECT id FROM edges WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?) LIMIT 1'
        );
        const insertEdge = db.prepare(
          'INSERT INTO edges (id, source_id, target_id, relationship_label, edge_type, weight) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const updateDeg = db.prepare(
          `UPDATE nodes SET degree_centrality =
             (SELECT COUNT(*) FROM edges WHERE source_id = nodes.id OR target_id = nodes.id)
           WHERE id = ?`
        );
        for (const { nodeId: otherId, score } of similar) {
          if (otherId === nodeId) continue;
          const exists = checkEdge.get(nodeId, otherId, otherId, nodeId);
          if (!exists) {
            const w = Math.round(score * 100) / 100;
            insertEdge.run(uuidv4(), nodeId, otherId, 'semantic similarity', 'semantic', w);
            updateDeg.run(nodeId);
            updateDeg.run(otherId);
          }
        }
      }
    } catch {
      // HNSW/semantic-edge failure is non-fatal.
    }

  } catch (err) {
    // Blacklist this node - never try it again
    blacklist.add(nodeId);
    consecutiveFails++;

    // Only log unexpected errors (not null access)
    const msg = err?.message || '';
    if (!msg.includes('null') && !msg.includes('metadata') && !msg.includes('undefined')) {
      console.error('[Embedding] Unexpected error:', msg);
    }
  }

  scheduleNext(100);
}

module.exports = {
  enqueueEmbeddingJob: enqueue,
  enqueue,
  getStats: () => ({
    queued: queue.length,
    processing,
    blacklisted: blacklist.size,
    consecutiveFails
  })
};
