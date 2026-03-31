# RyFlow

Think together. Build locally. Stay private.

RyFlow is an offline-first AI collaboration workspace designed for student teams, builders, and local-first communities. It combines docs, tasks, code, canvas, voice, and graph intelligence in one desktop-ready product.

[![Last Commit](https://img.shields.io/github/last-commit/sh4shv4t/RyFlow/main)](https://github.com/sh4shv4t/RyFlow)
[![Open Issues](https://img.shields.io/github/issues/sh4shv4t/RyFlow)](https://github.com/sh4shv4t/RyFlow/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Why RyFlow

- Private by default: runs locally with your own models
- Built for collaboration: shared workspace patterns for campus teams
- Fast and practical: lightweight stack with strong developer ergonomics
- Offline-first experience: keep working even without internet

## What You Can Do

- Rich AI writing with backlinks, mentions, comments, and history
- Local AI chat with streaming responses and reusable chat sessions
- Study guide generation from your own notes and documents
- Visual canvas workflows with compressed save/load support
- Knowledge graph search with semantic context and linked nodes
- Task management and cross-content workspace intelligence
- Voice transcription support via Whisper integration
- Workspace portability: export, import, and LAN collaboration

## Product Highlights

### Workspace-native Knowledge

Your notes, tasks, code files, and canvases are linked in a single graph so context never gets lost.

### Local AI, Real Productivity

Use local models for chat, summarization, extraction, and study support without handing your data to external services.

### Built for Teams

Designed for student projects and collaborative squads with practical workflows, not toy demos.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, Tailwind CSS, TipTap, D3, Zustand, Framer Motion |
| Backend | Node.js, Express, better-sqlite3, Socket.io |
| AI | Ollama, phi3:mini, nomic-embed-text, Whisper.cpp |
| Collaboration | WebRTC, mDNS discovery, Yjs |
| Desktop | Electron |

## Requirements

- Node.js 18+
- Ollama installed and running
- Optional: AMD GPU with ROCm for acceleration
- Optional: Whisper.cpp for voice transcription

## Quick Start

### 1) Install dependencies

```bash
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2) Pull local models

```bash
ollama pull phi3:mini
ollama pull nomic-embed-text
```

### 3) Run in development

```bash
npm run dev
```

Frontend runs on port 5173 and backend on port 3001.

### 4) Launch desktop app

```bash
npm run electron
```

## Setup Flow

On first launch, RyFlow opens a guided setup wizard that helps you:

- verify Ollama availability
- verify model readiness
- detect acceleration and optional voice support
- create your first workspace

## Available Scripts

| Script | Purpose |
|---|---|
| npm run dev | Runs frontend and backend together |
| npm run dev:backend | Runs backend only |
| npm run dev:frontend | Runs frontend only |
| npm run electron | Launches desktop shell |
| npm run build | Builds frontend production bundle |

## Configuration

Create or update backend environment values in backend/.env:

```env
PORT=3001
OLLAMA_BASE=http://localhost:11434
OLLAMA_MODEL=phi3:mini
EMBED_MODEL=nomic-embed-text
WHISPER_PATH=/path/to/whisper
WHISPER_MODEL=/path/to/model.bin
```

## AMD and Performance Notes

RyFlow works on CPU-only systems and automatically uses acceleration when available.

- with AMD + ROCm: lower latency and higher throughput
- without ROCm: fully functional, slightly slower inference

## Contributing

Contributions, bug reports, and ideas are welcome.

- open an issue with repro steps or feature proposal
- keep pull requests focused and testable
- prefer additive changes over disruptive rewrites

## License

MIT

