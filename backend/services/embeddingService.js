// Semantic search using cosine similarity over stored embedding vectors
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
  }

  if (node.created_at) parts.push(`Created: ${node.created_at}`);
  return parts.join('. ');
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

// Performs semantic search across all knowledge graph nodes in a workspace
async function semanticSearch(query, workspaceId, topK = 5) {
  const queryEmbedding = await embed(query);
  const db = getDb();
  const nodes = db.prepare(
    'SELECT * FROM nodes WHERE workspace_id = ? AND embedding IS NOT NULL'
  ).all(workspaceId);

  // Return an empty result set when there is no embedded content yet.
  if (!nodes.length || !queryEmbedding.length) {
    return [];
  }

  return nodes
    .map(node => {
      let parsedEmbedding = [];
      try {
        parsedEmbedding = JSON.parse(node.embedding);
      } catch {
        parsedEmbedding = [];
      }
      return {
        id: node.id,
        type: node.type,
        title: node.title,
        content_summary: node.content_summary,
        metadata: parseMetadata(node.metadata),
        created_at: node.created_at,
        score: cosineSimilarity(queryEmbedding, parsedEmbedding)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Generates and stores an embedding for a given node
async function generateAndStoreEmbedding(nodeId, text) {
  try {
    const textToEmbed = typeof text === 'object' ? buildEmbedText(text) : String(text || '').trim();
    const embedding = await embed(textToEmbed);
    const db = getDb();
    db.prepare('UPDATE nodes SET embedding = ? WHERE id = ?')
      .run(JSON.stringify(embedding), nodeId);
    return embedding;
  } catch (err) {
    console.error('[Embedding] Failed to generate embedding:', err.message);
    return null;
  }
}

module.exports = { cosineSimilarity, semanticSearch, generateAndStoreEmbedding, embedText, buildEmbedText, parseMetadata };
