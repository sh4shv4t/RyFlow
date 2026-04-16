// Semantic search — hybrid HNSW ANN + FTS5 BM25 + RRF + recency decay
const { getDb } = require('../db/database');
const { embed } = require('./ollamaService');

// Parses a JSON metadata payload safely.
function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

// Builds the richest possible embedding text for every node type.
function buildEmbedText(node = {}) {
  const metadata = parseMetadata(node.metadata);
  const parts = [];

  parts.push(`Type: ${node.type || 'unknown'}`);
  if (node.title) parts.push(`Title: ${node.title}`);
  if (node.content_summary || node.content) parts.push(`Content: ${node.content_summary || node.content}`);

  if (node.type === 'task') {
    if (metadata.priority) parts.push(`Priority: ${metadata.priority}`);
    if (metadata.assignee) parts.push(`Assignee: ${metadata.assignee}`);
    if (metadata.due_date) parts.push(`Due: ${metadata.due_date}`);
    if (metadata.status) parts.push(`Status: ${metadata.status}`);
  }

  if (node.type === 'code') {
    if (metadata.language) parts.push(`Language: ${metadata.language}`);
    if (metadata.line_count !== undefined) parts.push(`Line Count: ${metadata.line_count}`);
  }

  if (node.type === 'canvas') {
    if (metadata.element_count !== undefined) parts.push(`Elements: ${metadata.element_count}`);
  }

  if (node.type === 'ai_chat') {
    if (metadata.model) parts.push(`Model: ${metadata.model}`);
    if (metadata.message_count !== undefined) parts.push(`Messages: ${metadata.message_count}`);
    if (metadata.rag_used !== undefined) parts.push(`RAG Used: ${Boolean(metadata.rag_used)}`);
  }

  if (node.type === 'doc') {
    if (metadata.word_count !== undefined) parts.push(`Word Count: ${metadata.word_count}`);
    if (metadata.last_editor) parts.push(`Last Editor: ${metadata.last_editor}`);
    if (metadata.is_daily_note) parts.push('Daily Note: true');
    if (metadata.daily_note_date) parts.push(`Daily Note Date: ${metadata.daily_note_date}`);
  }

  if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
    parts.push(`Tags: ${metadata.tags.join(', ')}`);
  }

  if (node.created_at) parts.push(`Created: ${node.created_at}`);
  return parts.join('. ');
}

// Converts float arrays to compact binary buffers for SQLite BLOB storage.
function floatArrayToBuffer(floatArray) {
  const source = Array.isArray(floatArray) ? floatArray : [];
  const buffer = Buffer.allocUnsafe(source.length * 4);
  for (let i = 0; i < source.length; i += 1) {
    buffer.writeFloatLE(Number(source[i] || 0), i * 4);
  }
  return buffer;
}

// Converts binary embedding buffers to numeric arrays used in cosine similarity.
function bufferToFloatArray(buffer) {
  const byteBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const count = Math.floor(byteBuffer.length / 4);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    values[i] = byteBuffer.readFloatLE(i * 4);
  }
  return Array.from(values);
}

// Parses either new binary embeddings or legacy JSON-string embeddings.
function parseEmbedding(raw) {
  if (!raw) return null;

  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    try {
      return bufferToFloatArray(raw);
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(raw.toString());
    return Array.isArray(parsed) ? parsed.map((x) => Number(x || 0)) : null;
  } catch {
    return null;
  }
}

function loadNodeTagsMap(db, nodeIds = []) {
  if (!nodeIds.length) return new Map();
  const placeholders = nodeIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT nt.node_id, t.id AS tag_id, t.name, t.color
     FROM node_tags nt
     JOIN tags t ON t.id = nt.tag_id
     WHERE nt.node_id IN (${placeholders})`
  ).all(...nodeIds);

  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.node_id)) map.set(row.node_id, []);
    map.get(row.node_id).push({ id: row.tag_id, name: row.name, color: row.color });
  });
  return map;
}

// Builds and embeds combined title/content text.
async function embedText(title, content) {
  const textToEmbed = `${title || ''}. ${content || ''}`.trim();
  return embed(textToEmbed);
}

// Computes cosine similarity between two vectors
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// ---------- Hybrid search helpers (B2, B3, B4) ----------

// Brute-force vector search used as fallback when HNSW is unavailable/insufficient.
function bruteForceVectorSearch(queryEmbedding, nodes) {
  return nodes
    .map((node) => {
      const vec = parseEmbedding(node.embedding);
      return { nodeId: node.id, score: vec ? cosineSimilarity(queryEmbedding, vec) : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

// FTS5 BM25 search. Returns [{nodeId, rank}] ordered by relevance (rank is negative in SQLite).
function bm25Search(db, workspaceId, query, topK) {
  try {
    // Sanitize query for FTS5 MATCH: strip special chars that would cause parse errors.
    const safeQuery = String(query || '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, ' ')
      .trim();
    if (!safeQuery) return [];

    const rows = db.prepare(
      `SELECT nf.node_id, bm25(nodes_fts) AS rank
       FROM nodes_fts nf
       JOIN nodes n ON n.id = nf.node_id
       WHERE nf.nodes_fts MATCH ?
         AND n.workspace_id = ?
       ORDER BY rank
       LIMIT ?`
    ).all(safeQuery, workspaceId, topK);

    return rows.map((r) => ({ nodeId: r.node_id, rank: r.rank }));
  } catch {
    return [];
  }
}

// Reciprocal Rank Fusion. k=60 (standard).
function rrfFuse(vectorHits, bm25Hits, k = 60) {
  const scores = new Map();
  vectorHits.forEach((hit, i) => {
    const prev = scores.get(hit.nodeId) || 0;
    scores.set(hit.nodeId, prev + 1 / (k + i + 1));
  });
  bm25Hits.forEach((hit, i) => {
    const prev = scores.get(hit.nodeId) || 0;
    scores.set(hit.nodeId, prev + 1 / (k + i + 1));
  });
  return scores;
}

// Recency decay: exp(-0.01 * days_since_modified). Lambda=0.01 means ~37% decay at 100 days.
function decayScore(score, updatedAt, createdAt) {
  const dateStr = updatedAt || createdAt;
  if (!dateStr) return score;
  const ageDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays) || ageDays < 0) return score;
  return score * Math.exp(-0.01 * ageDays);
}

// Performs semantic search across all knowledge graph nodes in a workspace.
// Uses HNSW ANN (if available + ≥50 nodes), FTS5 BM25, RRF fusion, and recency decay.
// Return shape is identical to the previous brute-force implementation so all callers
// (buildRagMessages in ai.js, /api/graph/search route) require no changes.
async function semanticSearch(query, workspaceId, topK = 5) {
  const queryEmbedding = await embed(query);
  const db = getDb();

  // Fetch all nodes with embeddings for brute-force fallback and metadata enrichment.
  const allNodes = db.prepare(
    'SELECT id, workspace_id, type, title, content_summary, metadata, source_id, updated_at, created_at, embedding FROM nodes WHERE workspace_id = ? AND embedding IS NOT NULL'
  ).all(workspaceId);

  if (!allNodes.length || !queryEmbedding.length) return [];

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const candidateCount = topK * 4;

  // --- Vector candidates (HNSW or brute-force fallback) ---
  let vectorHits;
  try {
    const hnswIndex = require('./hnswIndex');
    const hnswResults = hnswIndex.search(workspaceId, queryEmbedding, candidateCount);
    if (hnswResults && hnswResults.length > 0) {
      vectorHits = hnswResults;
    } else {
      vectorHits = bruteForceVectorSearch(queryEmbedding, allNodes).slice(0, candidateCount);
    }
  } catch {
    vectorHits = bruteForceVectorSearch(queryEmbedding, allNodes).slice(0, candidateCount);
  }

  // --- BM25 candidates via FTS5 ---
  const bm25Hits = bm25Search(db, workspaceId, query, candidateCount);

  // --- RRF fusion ---
  let fusedScores;
  if (bm25Hits.length === 0) {
    // Pure vector fallback when no keyword matches.
    fusedScores = new Map(vectorHits.map((h, i) => [h.nodeId, 1 / (60 + i + 1)]));
  } else {
    fusedScores = rrfFuse(vectorHits, bm25Hits);
  }

  const tagsMap = loadNodeTagsMap(db, Array.from(fusedScores.keys()).filter((id) => nodeMap.has(id)));

  // --- Build results with recency decay ---
  const results = [];
  for (const [nodeId, baseScore] of fusedScores) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const decayed = decayScore(baseScore, node.updated_at, node.created_at);
    const tags = tagsMap.get(nodeId) || [];
    const parsedMetadata = parseMetadata(node.metadata);
    if (tags.length) parsedMetadata.tags = tags.map((t) => t.name);
    results.push({
      id: node.id,
      type: node.type,
      title: node.title,
      content_summary: node.content_summary,
      metadata: parsedMetadata,
      tags,
      source_id: node.source_id,
      created_at: node.created_at,
      updated_at: node.updated_at,
      score: decayed
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

// Generates and stores an embedding for a given node
async function generateAndStoreEmbedding(nodeId, text) {
  try {
    const textToEmbed = typeof text === 'object' ? buildEmbedText(text) : String(text || '').trim();
    if (!textToEmbed) return null;
    const embedding = await embed(textToEmbed);
    const db = getDb();
    const packed = floatArrayToBuffer(embedding || []);
    db.prepare('UPDATE nodes SET embedding = ? WHERE id = ?')
      .run(packed, nodeId);
    return embedding;
  } catch {
    return null;
  }
}

module.exports = {
  cosineSimilarity,
  semanticSearch,
  generateAndStoreEmbedding,
  embedText,
  buildEmbedText,
  parseMetadata,
  floatArrayToBuffer,
  bufferToFloatArray,
  parseEmbedding
};
