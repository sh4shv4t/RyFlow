// Background embedding queue so save routes remain responsive under heavy writes.
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { generateAndStoreEmbedding } = require('./embeddingService');

let workerTimer = null;
let workerRunning = false;

function serializePayload(payload) {
  if (!payload) return null;
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

function enqueueEmbeddingJob(nodeId, payload = null) {
  if (!nodeId) return null;
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO embedding_jobs (id, node_id, payload, status, retries, error, next_run_at)
     VALUES (?, ?, ?, 'pending', 0, NULL, CURRENT_TIMESTAMP)`
  ).run(id, nodeId, serializePayload(payload));
  return id;
}

function parsePayload(payloadText) {
  if (!payloadText) return null;
  try {
    return JSON.parse(payloadText);
  } catch {
    return null;
  }
}

function pickNextJob(db) {
  return db.prepare(
    `SELECT * FROM embedding_jobs
     WHERE status IN ('pending', 'retry')
       AND datetime(next_run_at) <= datetime('now')
     ORDER BY created_at ASC
     LIMIT 1`
  ).get();
}

async function processOneJob() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const db = getDb();
    const job = pickNextJob(db);
    if (!job) return;

    db.prepare(
      "UPDATE embedding_jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?"
    ).run(job.id);

    const payload = parsePayload(job.payload);
    const text = payload && typeof payload === 'object' ? payload : null;
    const result = await generateAndStoreEmbedding(job.node_id, text);

    if (result) {
      db.prepare("UPDATE embedding_jobs SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
      return;
    }

    const nextRetries = Number(job.retries || 0) + 1;
    if (nextRetries >= 3) {
      db.prepare(
        "UPDATE embedding_jobs SET status = 'failed', retries = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(nextRetries, 'Embedding generation failed', job.id);
      return;
    }

    db.prepare(
      `UPDATE embedding_jobs
       SET status = 'retry', retries = ?, error = ?,
           next_run_at = datetime('now', '+' || ? || ' seconds'),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(nextRetries, 'Embedding generation failed', 10 * nextRetries, job.id);
  } catch (err) {
    console.error('[EmbeddingQueue] Worker error:', err.message);
  } finally {
    workerRunning = false;
  }
}

function startEmbeddingWorker(intervalMs = 2000) {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    processOneJob().catch((err) => {
      console.error('[EmbeddingQueue] Process error:', err.message);
    });
  }, intervalMs);
}

function stopEmbeddingWorker() {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}

module.exports = {
  enqueueEmbeddingJob,
  startEmbeddingWorker,
  stopEmbeddingWorker
};
