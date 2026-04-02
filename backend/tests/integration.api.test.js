const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fetch = require('node-fetch');

const BACKEND_PORT = 3101;
const BASE_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let serverProc = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await sleep(300);
  }
  throw new Error('Backend did not become healthy in time');
}

async function api(pathname, options = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { res, body };
}

test.before(async () => {
  serverProc = spawn(process.execPath, ['index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', () => {});

  await waitForHealth();
});

test.after(async () => {
  if (!serverProc) return;
  serverProc.kill('SIGINT');
  await sleep(600);
  if (!serverProc.killed) {
    serverProc.kill('SIGKILL');
  }
});

test('health endpoint responds', async () => {
  const { res, body } = await api('/api/health');
  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
});

test('docs create/list/delete flow works', async () => {
  const active = await api('/api/workspaces/active');
  assert.equal(active.res.status, 200);

  let workspaceId = active.body?.active?.workspace_id;
  if (!workspaceId) {
    const wsName = `integration-ws-${Date.now()}`;
    const created = await api('/api/workspaces/create', {
      method: 'POST',
      body: JSON.stringify({
        name: wsName,
        owner_name: 'Integration Bot',
        description: 'created by integration test'
      })
    });
    assert.equal(created.res.status, 201);
    workspaceId = created.body?.workspace?.id;
  }

  assert.ok(workspaceId, 'workspace id must be available');

  const createdDoc = await api('/api/docs', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      title: 'Integration Test Doc',
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'integration test' }] }]
      })
    })
  });

  assert.equal(createdDoc.res.status, 201);
  const docId = createdDoc.body?.id;
  assert.ok(docId, 'created document id should exist');

  const docs = await api(`/api/docs?workspace_id=${workspaceId}`);
  assert.equal(docs.res.status, 200);
  const listed = Array.isArray(docs.body?.documents)
    ? docs.body.documents.find((d) => d.id === docId)
    : null;
  assert.ok(listed, 'created document should be present in docs list');

  const deleted = await api(`/api/docs/${docId}`, { method: 'DELETE' });
  assert.equal(deleted.res.status, 200);
  assert.equal(deleted.body?.success, true);
});

test('tags create/assign/filter/delete flow works', async () => {
  const active = await api('/api/workspaces/active');
  assert.equal(active.res.status, 200);
  const workspaceId = active.body?.active?.workspace_id;
  assert.ok(workspaceId, 'active workspace required for tags flow');

  const createdDoc = await api('/api/docs', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      title: 'Tag Assignment Doc',
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'tag flow' }] }]
      })
    })
  });
  assert.equal(createdDoc.res.status, 201);
  const docId = createdDoc.body?.id;
  assert.ok(docId, 'document for tag assignment should exist');

  const createdTag = await api('/api/tags', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      name: `integration-tag-${Date.now()}`,
      color: '#64748b'
    })
  });

  assert.equal(createdTag.res.status, 201);
  const tagId = createdTag.body?.id;
  assert.ok(tagId, 'created tag id should exist');

  const assign = await api('/api/tags/assign', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      type: 'doc',
      source_id: docId,
      tag_ids: [tagId]
    })
  });

  assert.equal(assign.res.status, 200);
  assert.equal(assign.body?.success, true);

  const bySource = await api(`/api/tags/by-source?workspace_id=${workspaceId}&type=doc&source_id=${docId}`);
  assert.equal(bySource.res.status, 200);
  const sourceTags = Array.isArray(bySource.body?.tags) ? bySource.body.tags : [];
  assert.ok(sourceTags.some((t) => t.id === tagId), 'created tag should appear in by-source response');

  const filtered = await api(`/api/tags/filter?workspace_id=${workspaceId}&tag_id=${tagId}`);
  assert.equal(filtered.res.status, 200);
  const filteredItems = Array.isArray(filtered.body?.items) ? filtered.body.items : [];
  assert.ok(filteredItems.some((item) => item.source_id === docId), 'tag filter should include tagged document');

  const deleteTag = await api(`/api/tags/${tagId}`, { method: 'DELETE' });
  assert.equal(deleteTag.res.status, 200);

  const deleteDoc = await api(`/api/docs/${docId}`, { method: 'DELETE' });
  assert.equal(deleteDoc.res.status, 200);
}
);