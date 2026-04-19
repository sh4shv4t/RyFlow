# Collaboration & Y.js Audit — RyFlow network-optimizations branch

> Date: 2026-04-19  
> Audited files: `useCollaboration.js`, `lanDiscovery.js`, `PeerList.jsx`, `WorkspaceSetup.jsx`, `backend/p2p/discovery.js`, `backend/index.js`, `electron/main.js`, `electron/preload.js`, `package.json`, `backend/package.json`, `frontend/package.json`, `RichEditor.jsx`, `TopBar.jsx`, `Sidebar.jsx`

---

## Y.js

### Q1 — Is `yjs` installed and imported? Which version?

**YES.** `"yjs": "^13.6.10"` in `frontend/package.json`.  
Imported in `useCollaboration.js` as `import * as Y from 'yjs'`.

### Q2 — Is `y-webrtc` installed? Actually used?

**YES — installed and actually wired.**  
`"y-webrtc": "^10.3.0"` in `frontend/package.json`.  
`WebrtcProvider` is imported from `y-webrtc` and instantiated in `useCollaboration.js`.  
`RichEditor.jsx` consumes `{ ydoc, provider }` from `useCollaboration`, and passes `provider` to `CollaborationCursor.configure`.

### Q3 — Y.Doc types used; which editor areas are bound?

- `Y.Doc` (base document instance) — created per collaboration session.
- `Y.XmlFragment` (`ydoc.getXmlFragment('default')`) — used by TipTap's `Collaboration` extension for the rich-text editor.
- `Y.Map` / `Y.Array` — **not used** anywhere. Tasks and canvas are not bound to Y.js.

**Bound:** TipTap rich-text editor only (`RichEditor.jsx`), and only when `remoteMode === true`.

### Q4 — Is Y.js awareness wired?

**YES — fully wired in `RichEditor.jsx`.**  
`useCollaboration.js` calls `awareness.setLocalStateField('user', { name, color })` on provider init.  
`RichEditor.jsx` configures `CollaborationCursor.configure({ provider, user: { name: userName, color: user?.avatar_color || '#E8000D' } })`.  
CSS for `.collaboration-cursor__caret` and `.collaboration-cursor__label` exists in `index.css`.

### Q5 — What signaling server URL is configured?

**Self-hosted, not public.** `buildSignalingUrls()` in `useCollaboration.js` constructs:
- `ws://127.0.0.1:3001/yjs` (Electron / file:// context)
- `ws://${host}:3001/yjs` (Vite dev — host taken from `window.location.hostname`, port hardcoded to `3001`)
- `ws://${remoteHost}:${remotePort}/yjs` (remote workspace join, from localStorage)

No reference to `wss://signaling.yjs.dev` anywhere in the codebase.

### Q6 — Is there a local WebSocket signaling server in the backend?

**YES — fully implemented in `backend/index.js`.**  
A `WebSocketServer` (`ws` package) is created at the `noServer` level and handles the HTTP upgrade for path `/yjs`.  
It implements a full y-webrtc topic pub/sub signaling protocol (subscribe / unsubscribe / publish / ping-pong).  
Console confirms: `🔗 Yjs signaling active at ws://${LOCAL_IP}:${PORT}/yjs`.

---

## WebRTC / LAN

### Q7 — Is mDNS/Bonjour initialised on app start or behind a flag?

**Initialised unconditionally on app start.**  
`startDiscovery('Host', PORT)` is called inside the `server.listen` callback in `backend/index.js` with a try/catch fallback. Not behind any feature flag.

### Q8 — Is there a TURN/STUN server configured?

**NO.** The `WebrtcProvider` constructor in `useCollaboration.js` does not pass an `iceServers` option. y-webrtc uses browser WebRTC defaults (which include Google's public STUN servers: `stun:stun.l.google.com:19302`), but there is no TURN server configured. Connections across strict NAT or networks with client isolation will fail.

### Q9 — Is `lanDiscovery.js` dead code or actually called?

**Actually called.** `TopBar.jsx` calls `startPeerPolling(setPeers)` on mount and `stopPeerPolling()` on unmount. This polls `/api/peers` every 5 seconds and writes to the Zustand `peers` store.

### Q10 — Does `PeerList` render real peers or placeholder data?

**Real peers** from mDNS discovery. `PeerList.jsx` reads `useStore().peers`, which is populated by `startPeerPolling` → `/api/peers` → `getPeers()` in `backend/p2p/discovery.js` → live Bonjour browser results. Data is not mocked.

---

## Gaps

### Q11 — Features imported/stubbed but not wired end-to-end

1. **`CollabPresence.jsx`** — exists and renders a peer presence bar, but is never imported or mounted anywhere in the app. Its `presenceList` prop has no data source.

2. **Socket.io client** — `backend/index.js` runs a full Socket.io server with `join-workspace`, `presence-update`, `signal-offer`, `signal-answer`, `signal-ice`, `cursor-update`, and `doc-update` events. There is **no `socket.io-client` import or usage** anywhere in the frontend. The entire Socket.io signaling layer is server-only dead code.

3. **Y.js collaboration gated behind `remoteMode`** — In `RichEditor.jsx`, `collaborationEnabled = Boolean(remoteMode && ydoc && provider && ...)`. In standalone/local mode, Y.js is never activated, even if two local tabs have the same document open.

4. **Tasks and canvas not synced** — Only `Y.XmlFragment` (TipTap) is bound. `TaskBoard` and `RyCanvas` use local state only; no Y.js `Y.Map` or `Y.Array` sync.

5. **Sidebar peer count** — `TopBar.jsx` shows a peer count chip when `peers.length > 0`. The `Sidebar.jsx` workspace name block does not surface peer count at all, leaving the sidebar with no real-time collaboration indicator.

### Q12 — Features that require a TURN server

- **y-webrtc WebRTC connections** across subnets or behind symmetric NAT (e.g., university WiFi with client isolation).
- **Socket.io WebRTC signaling** (`signal-offer` / `signal-answer` / `signal-ice`) — if and when client-side Socket.io is wired up.

---

## Implementation decisions

| Item | Status | Action |
|------|--------|--------|
| **N1** — Self-hosted Y.js signaling server | ✅ ALREADY DONE | Backend `/yjs` WebSocket is fully implemented. Client points to it. Nothing to implement. |
| **N2** — Peer count in sidebar | ⚠️ PARTIAL (TopBar has it, Sidebar does not) | **IMPLEMENTING** — add `● N peers` dot+count next to workspace name in `Sidebar.jsx` |
| **N3** — Named cursors in TipTap | ✅ ALREADY DONE | `CollaborationCursor` is wired in `RichEditor.jsx` with user name and avatar_color. CSS is in `index.css`. |
