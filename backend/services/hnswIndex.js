// Per-workspace HNSW approximate nearest-neighbor index for fast semantic search.
// Uses hnswlib-node (pulled transitively via hnswsqlite) with a UUID↔int label map
// persisted alongside each workspace .db file.
'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR =
  process.env.RYFLOW_DATA_DIR ||
  path.join(require('os').homedir(), '.ryflow', 'workspaces');

const DIM = 768;
const MIN_NODES_FOR_HNSW = 50;

// Lazily loaded to handle missing native binaries gracefully.
let HierarchicalNSW = null;
let hnswAvailable = false;
try {
  ({ HierarchicalNSW } = require('hnswlib-node'));
  hnswAvailable = true;
} catch (err) {
  console.warn('[HNSW] hnswlib-node not available, brute-force fallback active:', err.message);
}

// In-memory cache: workspaceId → { index: HierarchicalNSW, map: { nodes: {uuid→label}, nextLabel } }
const caches = new Map();

function indexFilePath(workspaceId) {
  return path.join(DATA_DIR, `workspace_${workspaceId}.hnsw`);
}

function mapFilePath(workspaceId) {
  return path.join(DATA_DIR, `workspace_${workspaceId}.hnsw.map.json`);
}

function readMapFile(workspaceId) {
  const p = mapFilePath(workspaceId);
  if (!fs.existsSync(p)) return { nodes: {}, nextLabel: 0 };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { nodes: {}, nextLabel: 0 };
  }
}

function writeMapFile(workspaceId, map) {
  try {
    fs.writeFileSync(mapFilePath(workspaceId), JSON.stringify(map), 'utf8');
  } catch (err) {
    console.error('[HNSW] Could not write map file:', err.message);
  }
}

// Builds the HNSW index from all existing embeddings in the database.
function buildFromDb(workspaceId) {
  let db;
  try {
    db = require('../db/database').getDb();
  } catch {
    return null;
  }

  const { parseEmbedding } = require('./embeddingService');

  const rows = db.prepare(
    'SELECT id, embedding FROM nodes WHERE workspace_id = ? AND embedding IS NOT NULL'
  ).all(workspaceId);

  const validRows = rows.filter((r) => {
    const vec = parseEmbedding(r.embedding);
    return vec && vec.length === DIM;
  });

  if (validRows.length === 0) {
    return { index: null, map: { nodes: {}, nextLabel: 0 } };
  }

  const maxElements = Math.max(validRows.length + 500, 1000);
  const index = new HierarchicalNSW('cosine', DIM);
  index.initIndex(maxElements, 16, 200, 100);

  const map = { nodes: {}, nextLabel: 0 };
  for (const row of validRows) {
    const vec = parseEmbedding(row.embedding);
    if (!vec || vec.length !== DIM) continue;
    const label = map.nextLabel++;
    map.nodes[row.id] = label;
    index.addPoint(vec, label);
  }

  // Persist to disk (sync API — writeIndex() returns a Promise in v1.4+).
  try {
    index.writeIndexSync(indexFilePath(workspaceId));
    writeMapFile(workspaceId, map);
  } catch (err) {
    console.error('[HNSW] Could not write index to disk:', err.message);
  }

  return { index, map };
}

// Loads the cached entry, or builds from DB if not in cache.
function getOrLoad(workspaceId) {
  if (!hnswAvailable) return null;
  if (caches.has(workspaceId)) return caches.get(workspaceId);

  const idxPath = indexFilePath(workspaceId);
  const mapExists = fs.existsSync(mapFilePath(workspaceId));
  const idxExists = fs.existsSync(idxPath);

  let entry = null;

  if (idxExists && mapExists) {
    // Guard against truncated/corrupt files — a valid HNSW binary is always > 512 bytes.
    let idxSize = 0;
    try { idxSize = fs.statSync(idxPath).size; } catch {}

    if (idxSize < 512) {
      console.warn(`[HNSW] Index file too small (${idxSize} B) — treating as corrupt, rebuilding.`);
      try { fs.unlinkSync(idxPath); } catch {}
      try { fs.unlinkSync(mapFilePath(workspaceId)); } catch {}
      entry = buildFromDb(workspaceId);
    } else {
      try {
        const map = readMapFile(workspaceId);
        const maxElements = Math.max(Object.keys(map.nodes).length + 500, 1000);
        const index = new HierarchicalNSW('cosine', DIM);
        index.initIndex(maxElements, 16, 200, 100);
        // Use the synchronous API — readIndex() returns a Promise (v1.4+) and would
        // cause an unhandled rejection if not awaited inside a synchronous caller.
        index.readIndexSync(idxPath, true);
        entry = { index, map };
      } catch (err) {
        console.warn('[HNSW] Could not load index from disk, rebuilding:', err.message);
        try { fs.unlinkSync(idxPath); } catch {}
        try { fs.unlinkSync(mapFilePath(workspaceId)); } catch {}
        entry = buildFromDb(workspaceId);
      }
    }
  } else {
    entry = buildFromDb(workspaceId);
  }

  if (entry) caches.set(workspaceId, entry);
  return entry;
}

// Performs ANN search. Returns [{nodeId, score}] sorted by descending similarity.
// Returns null if HNSW is unavailable, not built, or fewer than MIN_NODES_FOR_HNSW points.
function search(workspaceId, queryVec, topK) {
  if (!hnswAvailable) return null;
  try {
    const entry = getOrLoad(workspaceId);
    if (!entry || !entry.index) return null;

    const nodeCount = Object.keys(entry.map.nodes).length;
    if (nodeCount < MIN_NODES_FOR_HNSW) return null;

    const k = Math.min(topK, nodeCount);
    const result = entry.index.searchKnn(queryVec, k);
    if (!result || !result.neighbors) return null;

    // Invert map for label→uuid lookup.
    const labelToId = {};
    for (const [uuid, label] of Object.entries(entry.map.nodes)) {
      labelToId[label] = uuid;
    }

    return result.neighbors.map((label, i) => ({
      nodeId: labelToId[label],
      score: 1 - (result.distances[i] || 0) // cosine distance → similarity
    })).filter((r) => r.nodeId);
  } catch (err) {
    console.error('[HNSW] Search error:', err.message);
    return null;
  }
}

// Inserts or updates a node's embedding in the index and re-persists to disk.
function upsert(workspaceId, nodeId, floatArray) {
  if (!hnswAvailable) return;
  if (!floatArray || floatArray.length !== DIM) return;
  try {
    let entry = getOrLoad(workspaceId);

    if (!entry) {
      // Build from DB now that we have at least one embedding.
      entry = buildFromDb(workspaceId);
      if (entry) caches.set(workspaceId, entry);
      return;
    }

    const { index, map } = entry;

    if (!index) {
      // Index not yet built (was under threshold). Try rebuild.
      const rebuilt = buildFromDb(workspaceId);
      if (rebuilt) caches.set(workspaceId, rebuilt);
      return;
    }

    if (map.nodes[nodeId] !== undefined) {
      // hnswlib-node does not support point deletion/update; overwrite by label.
      try {
        index.markDelete(map.nodes[nodeId]);
      } catch {
        // Older versions may not support markDelete — ignore.
      }
    }

    // Grow index capacity if needed.
    const currentCount = Object.keys(map.nodes).length;
    if (currentCount >= index.getCurrentCount() + 1) {
      index.resizeIndex(currentCount + 500);
    }

    const label = map.nextLabel++;
    map.nodes[nodeId] = label;
    index.addPoint(floatArray, label);

    index.writeIndexSync(indexFilePath(workspaceId));
    writeMapFile(workspaceId, map);
  } catch (err) {
    console.error('[HNSW] Upsert error:', err.message);
  }
}

// Evicts a workspace from the in-memory cache (called when switching workspace).
function evict(workspaceId) {
  caches.delete(workspaceId);
}

// Returns nodes similar to queryVec with score >= minScore (default 0).
// Used by the embedding queue to auto-create semantic edges.
function findSimilar(workspaceId, queryVec, topK, minScore = 0) {
  if (!hnswAvailable) return [];
  try {
    const entry = getOrLoad(workspaceId);
    if (!entry || !entry.index) return [];

    const nodeCount = Object.keys(entry.map.nodes).length;
    if (nodeCount < 2) return [];

    const k = Math.min(topK, nodeCount);
    const result = entry.index.searchKnn(queryVec, k);
    if (!result || !result.neighbors) return [];

    const labelToId = {};
    for (const [uuid, label] of Object.entries(entry.map.nodes)) {
      labelToId[label] = uuid;
    }

    return result.neighbors
      .map((label, i) => ({
        nodeId: labelToId[label],
        score: 1 - (result.distances[i] || 0)
      }))
      .filter((r) => r.nodeId && r.score >= minScore);
  } catch (err) {
    console.error('[HNSW] findSimilar error:', err.message);
    return [];
  }
}

module.exports = { search, upsert, evict, findSimilar, isAvailable: () => hnswAvailable };
