# RyFlow

**Offline-first, peer-to-peer AI collaboration workspace for college students — powered by AMD's open-source AI stack.**

<p align="center">
  <strong style="color:#E8000D;">Ry</strong><strong>Flow</strong><br/>
  <em>Think together. Build locally. Stay private.</em>
</p>

---

[![GitHub last commit](https://img.shields.io/github/last-commit/sh4shv4t/LLM-Visibility-Optimization-Tool/main)](https://github.com/sh4shv4t/RyFlow)   
[![GitHub issues](https://img.shields.io/github/issues/sh4shv4t/LLM-Visibility-Optimization-Tool)](https://github.com/sh4shv4t/RyFlow/issues) 

## Features

| Feature | Description |
|---------|-------------|
| **Rich Editor** | TipTap-based collaborative document editor with AI-assisted writing (improve, summarize, translate, expand) |
| **AI Chat** | Local LLM chat powered by Ollama (phi3:mini default), fully streaming, multi-language |
| **Image Generation** | Text-to-image via Pollinations.ai — artistic, photorealistic, abstract, and minimal styles |
| **Voice Input** | Speech-to-text with Whisper.cpp — entirely offline on AMD GPUs |
| **Knowledge Graph** | D3.js force-directed graph connecting documents, tasks, and AI conversations with semantic search |
| **Task Board** | Kanban board with natural-language task creation via LLM parsing |
| **P2P Collaboration** | LAN peer discovery (mDNS/Bonjour), WebRTC signaling, real-time cursor presence |
| **Sustainability Tracker** | Monitors local inference energy savings vs cloud APIs |
| **Electron Desktop App** | Runs as a native desktop app on Windows, macOS, and Linux |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, TailwindCSS, Zustand, TipTap, D3.js, Framer Motion |
| **Backend** | Node.js, Express, better-sqlite3, Socket.io |
| **AI** | Ollama (phi3:mini), nomic-embed-text, Whisper.cpp, Pollinations.ai |
| **P2P** | simple-peer (WebRTC), bonjour-service (mDNS), Yjs (CRDT) |
| **Desktop** | Electron |

---

## Prerequisites

- **Node.js** ≥ 18
- **Ollama** — <https://ollama.com>
- (Optional) **AMD GPU** with ROCm drivers for GPU-accelerated inference
- (Optional) **Whisper.cpp** binary + `base.en` model for voice transcription

---

## Quick Start

### 1. Install Ollama & pull models

```bash
# Install Ollama (see https://ollama.com for your OS)
ollama pull phi3:mini
ollama pull nomic-embed-text
```

### 2. Clone & install

```bash
cd Ryflow

# Install root deps (concurrently, electron)
npm install

# Install backend deps
cd backend && npm install && cd ..

# Install frontend deps
cd frontend && npm install && cd ..
```

### 3. Run in development

```bash
npm run dev
```

This starts **backend** (port 3001) and **frontend** (port 5173) concurrently.

Open <http://localhost:5173> in your browser.

### 4. Run as Electron app

```bash
npm run electron
```

---

## Project Structure

```
Ryflow/
├── backend/
│   ├── db/
│   │   ├── schema.sql           # SQLite tables
│   │   └── database.js          # better-sqlite3 wrapper
│   ├── services/
│   │   ├── ollamaService.js     # LLM chat & embeddings
│   │   ├── embeddingService.js  # Semantic search
│   │   ├── whisperService.js    # Voice transcription
│   │   ├── imageService.js      # Pollinations.ai
│   │   └── graphService.js      # Knowledge graph logic
│   ├── routes/
│   │   ├── ai.js                # /api/ai/*
│   │   ├── documents.js         # /api/docs/*
│   │   ├── tasks.js             # /api/tasks/*
│   │   ├── graph.js             # /api/graph/*
│   │   ├── voice.js             # /api/voice/*
│   │   └── workspace.js         # /api/workspace/*
│   ├── p2p/
│   │   └── discovery.js         # mDNS LAN discovery
│   ├── index.js                 # Express + Socket.io server
│   └── .env                     # Environment config
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/          # Sidebar, TopBar, AMDbadge
│   │   │   ├── editor/          # RichEditor, AIAssistPanel, CollabPresence
│   │   │   ├── ai/              # ChatPanel, ImageGen, VoiceInput
│   │   │   ├── graph/           # KnowledgeGraph
│   │   │   ├── tasks/           # TaskBoard, NLTaskInput
│   │   │   └── workspace/       # WorkspaceSetup, PeerList
│   │   ├── pages/               # Home, Editor, Tasks, Graph, AIStudio, Workspace, Settings
│   │   ├── hooks/               # useOllama, usePeer, useVoice, useGraph
│   │   ├── store/               # Zustand global store
│   │   ├── utils/               # amdDetect, lanDiscovery
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── electron/
│   ├── main.js                  # Electron main process
│   └── preload.js               # Context bridge
├── package.json                 # Root scripts
└── README.md
```

---

## Scripts

| Script | Description |
|--------|------------|
| `npm run dev` | Start backend + frontend concurrently |
| `npm run dev:backend` | Start Express server only |
| `npm run dev:frontend` | Start Vite dev server only |
| `npm run electron` | Launch Electron desktop app |
| `npm run build` | Build frontend for production |

---

## Environment Variables

Edit `backend/.env`:

```env
PORT=3001
OLLAMA_BASE=http://localhost:11434
OLLAMA_MODEL=phi3:mini
EMBED_MODEL=nomic-embed-text
WHISPER_PATH=/usr/local/bin/whisper
WHISPER_MODEL=base.en
```

---

## Whisper.cpp Setup (Optional)

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make
# Download model
bash ./models/download-ggml-model.sh base.en
```

Set `WHISPER_PATH` in `.env` to point to the built binary.

---

## AMD ROCm Notes

RyFlow automatically detects AMD GPUs via `rocm-smi` (Linux) or `wmic` (Windows). When an AMD GPU with ROCm is detected:

- The **AMD badge** glows green: *"AMD ROCm — GPU Accelerated"*
- Ollama uses GPU acceleration automatically
- Sustainability tracker shows energy savings

Without an AMD GPU, everything runs on CPU — fully functional, just slower.

---

## Design System

| Token | Value |
|-------|-------|
| Primary | `#E8000D` (AMD Red) |
| Background | `#1A1A1A` (Charcoal) |
| Surface | `#2C2C2C` (Gray) |
| Text | `#F5F5F0` (White) |
| Accent | `#FF6B00` (Orange) |
| Success | `#00C853` (Green) |
| Heading Font | Syne |
| Body Font | Inter |

---
