// Semantic search using cosine similarity over stored embedding vectors
const { getDb } = require('../db/database');
const { embed } = require('./ollamaService');

// Builds embedding text consistently from a node-like object.
function buildEmbeddingText(node = {}) {
  return `${node.title || ''}. ${node.content || node.content_summary || ''}`.trim();
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
        score: cosineSimilarity(queryEmbedding, parsedEmbedding)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Generates and stores an embedding for a given node
async function generateAndStoreEmbedding(nodeId, text) {
  try {
    const textToEmbed = typeof text === 'object' ? buildEmbeddingText(text) : String(text || '').trim();
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

module.exports = { cosineSimilarity, semanticSearch, generateAndStoreEmbedding, embedText, buildEmbeddingText };
