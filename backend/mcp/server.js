/**
 * RyFlow MCP server — stdio transport, workspace tools only.
 * Uses the same SQLite handle as the app via ../db/database.js (no extra connections).
 */
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const dbApi = require('../db/database');
const registry = require('../db/registry');
const { embed } = require('../services/ollamaService');
const { cosineSimilarity, parseEmbedding } = require('../services/embeddingService');

const NO_WORKSPACE_MSG =
  'No active RyFlow workspace. Open RyFlow and load a workspace first.';

let boundWorkspaceId = null;

function resolveTargetWorkspaceId() {
  const envId = process.env.RYFLOW_MCP_WORKSPACE_ID?.trim();
  if (envId) return envId;
  const row = registry.prepare('SELECT workspace_id FROM active_session WHERE id = 1').get();
  return row?.workspace_id || null;
}

function getWorkspaceDb() {
  const target = resolveTargetWorkspaceId();
  if (!target) {
    throw new Error(NO_WORKSPACE_MSG);
  }
  if (boundWorkspaceId !== target) {
    dbApi.switchWorkspace(target);
    boundWorkspaceId = target;
  }
  return dbApi.getDb();
}

function okText(obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: 'text', text }] };
}

function errPayload(message) {
  return okText({ error: message });
}

function tableExists(db, name) {
  try {
    const row = db
      .prepare("SELECT 1 AS x FROM sqlite_master WHERE type IN ('table','virtual') AND name = ?")
      .get(name);
    return Boolean(row);
  } catch {
    return false;
  }
}

function hasColumn(db, table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some((c) => c.name === column);
  } catch {
    return false;
  }
}

function mapFilterType(t) {
  if (t === 'document') return 'doc';
  return t;
}

function preview150(s) {
  const str = String(s || '');
  return str.length <= 150 ? str : str.slice(0, 150);
}

async function searchWorkspace(args) {
  try {
    const db = getWorkspaceDb();
    const wsId = dbApi.getActiveWorkspaceId();
    const limit = args.limit ?? 10;
    let usedVector = false;
    let queryVec = null;

    try {
      queryVec = await embed(String(args.query || ''));
      usedVector = Array.isArray(queryVec) && queryVec.length > 0;
    } catch {
      queryVec = null;
      usedVector = false;
    }

    if (usedVector) {
      const rows = db
        .prepare(
          `SELECT id, title, type, content_summary, embedding
           FROM nodes
           WHERE workspace_id = ? AND embedding IS NOT NULL`
        )
        .all(wsId);

      const scored = rows
        .map((row) => {
          const vec = parseEmbedding(row.embedding);
          const score = vec && vec.length === queryVec.length ? cosineSimilarity(queryVec, vec) : 0;
          return {
            id: row.id,
            title: row.title,
            type: row.type,
            content_preview: preview150(row.content_summary),
            score
          };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      if (scored.length) {
        return okText({ results: scored, mode: 'vector' });
      }
    }

    // Fallback: FTS5 or LIKE
    const q = String(args.query || '').trim();
    if (!q) {
      return okText({ results: [], mode: 'fallback', note: 'Empty query.' });
    }

    if (tableExists(db, 'nodes_fts')) {
      try {
        const safeQuery = q.replace(/[^a-zA-Z0-9\s\-_]/g, ' ').trim();
        if (safeQuery) {
          const hits = db
            .prepare(
              `SELECT n.id, n.title, n.type, n.content_summary,
                      bm25(nodes_fts) AS rank
               FROM nodes_fts nf
               JOIN nodes n ON n.id = nf.node_id
               WHERE nf.nodes_fts MATCH ? AND n.workspace_id = ?
               ORDER BY rank
               LIMIT ?`
            )
            .all(safeQuery, wsId, limit);

          const results = hits.map((h) => ({
            id: h.id,
            title: h.title,
            type: h.type,
            content_preview: preview150(h.content_summary),
            score: typeof h.rank === 'number' ? -h.rank : 0
          }));
          return okText({ results, mode: 'fts' });
        }
      } catch (e) {
        // fall through to LIKE
      }
    }

    const like = `%${q.replace(/%/g, '').slice(0, 200)}%`;
    const rows = db
      .prepare(
        `SELECT id, title, type, content_summary
         FROM nodes
         WHERE workspace_id = ?
           AND (title LIKE ? OR IFNULL(content_summary, '') LIKE ?)
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(wsId, like, like, limit);

    const results = rows.map((h, i) => ({
      id: h.id,
      title: h.title,
      type: h.type,
      content_preview: preview150(h.content_summary),
      score: 1 / (i + 1)
    }));
    return okText({
      results,
      mode: 'like',
      note: usedVector ? 'Vector search had no matches; used keyword fallback.' : 'Ollama unavailable or no embeddings; used keyword fallback.'
    });
  } catch (e) {
    return errPayload(e instanceof Error ? e.message : String(e));
  }
}

function getDocument(args) {
  try {
    const db = getWorkspaceDb();
    const row = db.prepare('SELECT id, title, content, created_at, updated_at FROM documents WHERE id = ?').get(args.id);
    if (!row) {
      return okText({ content: '', message: `No document found with id ${args.id}.` });
    }
    return okText({
      id: row.id,
      title: row.title,
      content: row.content ?? '',
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  } catch (e) {
    return errPayload(e instanceof Error ? e.message : String(e));
  }
}

function bfsNodeIds(db, startId, maxDepth, maxNodes) {
  const included = new Set([startId]);
  let frontier = [startId];

  for (let d = 0; d < maxDepth; d += 1) {
    const next = [];
    for (const nid of frontier) {
      const adj = db
        .prepare('SELECT source_id, target_id FROM edges WHERE source_id = ? OR target_id = ?')
        .all(nid, nid);
      for (const { source_id, target_id } of adj) {
        const other = source_id === nid ? target_id : source_id;
        if (!included.has(other)) {
          if (included.size >= maxNodes) return included;
          included.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return included;
}

function getNeighbours(args) {
  try {
    const db = getWorkspaceDb();
    const maxDepth = Math.min(Math.max(Number(args.depth ?? 2), 1), 3);
    const start = args.node_id;
    const maxNodes = 50;

    const exists = db.prepare('SELECT 1 AS x FROM nodes WHERE id = ?').get(start);
    if (!exists) {
      return okText({ nodes: [], edges: [], message: `No node with id ${start}.` });
    }

    const ids = bfsNodeIds(db, start, maxDepth, maxNodes);
    const idList = Array.from(ids);
    if (!idList.length) {
      return okText({ nodes: [], edges: [] });
    }

    const placeholders = idList.map(() => '?').join(',');
    const degCol = hasColumn(db, 'nodes', 'degree_centrality');
    const nodeSql = degCol
      ? `SELECT id, title, type, degree_centrality, created_at FROM nodes WHERE id IN (${placeholders})`
      : `SELECT id, title, type, created_at FROM nodes WHERE id IN (${placeholders})`;
    const nodes = db.prepare(nodeSql).all(...idList);

    const edges = db
      .prepare(
        `SELECT id, source_id, target_id, relationship_label, edge_type, weight, created_at
         FROM edges
         WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders})`
      )
      .all(...idList, ...idList);

    return okText({ nodes, edges });
  } catch (e) {
    return errPayload(e instanceof Error ? e.message : String(e));
  }
}

function listWorkspaceContents(args) {
  try {
    const db = getWorkspaceDb();
    const wsId = dbApi.getActiveWorkspaceId();
    const hasUpdated = hasColumn(db, 'nodes', 'updated_at');
    const orderCol = hasUpdated ? 'updated_at' : 'created_at';
    const typeFilter = args.type ? mapFilterType(args.type) : null;

    let sql = `SELECT id, title, type, created_at${hasUpdated ? ', updated_at' : ''}
               FROM nodes WHERE workspace_id = ?`;
    const params = [wsId];
    if (typeFilter) {
      sql += ' AND type = ?';
      params.push(typeFilter);
    }
    sql += ` ORDER BY ${orderCol} DESC LIMIT 100`;

    const rows = db.prepare(sql).all(...params);
    const nodes = rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      created_at: r.created_at
    }));
    return okText({ nodes });
  } catch (e) {
    return errPayload(e instanceof Error ? e.message : String(e));
  }
}

function registerTools(server) {
  server.registerTool(
    'search_workspace',
    {
      title: 'Search workspace nodes',
      description:
        'Semantic search over node embeddings (Ollama nomic-embed-text), with FTS5 or LIKE fallback.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional().default(10)
      })
    },
    async (args) => searchWorkspace(args)
  );

  server.registerTool(
    'get_document',
    {
      title: 'Get document by id',
      description: 'Returns full document row from the documents table.',
      inputSchema: z.object({ id: z.string().min(1) })
    },
    async (args) => getDocument(args)
  );

  server.registerTool(
    'get_neighbours',
    {
      title: 'Neighbour subgraph',
      description: 'BFS over edges up to depth (max 3), at most 50 nodes.',
      inputSchema: z.object({
        node_id: z.string().min(1),
        depth: z.number().int().min(1).max(3).optional().default(2)
      })
    },
    async (args) => getNeighbours(args)
  );

  server.registerTool(
    'list_workspace_contents',
    {
      title: 'List nodes',
      description:
        "List nodes in the workspace (optional type: document | task | code | canvas | ai_chat). Document maps to stored type 'doc'.",
      inputSchema: z.object({
        type: z.enum(['document', 'task', 'code', 'canvas', 'ai_chat']).optional()
      })
    },
    async (args) => listWorkspaceContents(args)
  );
}

async function main() {
  process.on('unhandledRejection', (reason) => {
    console.error('[ryflow-mcp] unhandledRejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[ryflow-mcp] uncaughtException:', err);
  });

  const server = new McpServer(
    { name: 'ryflow-workspace', version: '1.1.0' },
    { capabilities: { tools: { listChanged: true } } }
  );

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[ryflow-mcp] fatal:', err);
  process.exit(1);
});
