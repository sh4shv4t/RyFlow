<div align="center">

<img src="assets\RyFlow_rectanglelogowithwords.png" alt="RyFlow" width="320" />

<br />

# RyFlow

**Your campus. Your GPU. Your AI.**

An offline-first, AMD-accelerated AI collaboration
workspace for college students and campus teams.
No cloud. No subscriptions. No internet required.

[![Built on AMD ROCm](https://img.shields.io/badge/AMD-ROCm%20Accelerated-E8000D?style=flat-square&logo=amd&logoColor=white)](https://rocm.docs.amd.com)
[![Powered by Ollama](https://img.shields.io/badge/AI-Ollama%20Local%20LLM-111111?style=flat-square)](https://ollama.ai)
[![Electron](https://img.shields.io/badge/Desktop-Electron-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org)
[![License](https://img.shields.io/badge/License-MIT-3D9970?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.1.0-E8000D?style=flat-square)](package.json)

</div>

---

## What is RyFlow?

RyFlow turns the AMD chip already inside your laptop
into a private, offline AI brain that your entire
campus team shares. Every feature (writing assistance,
semantic search, real-time collaboration, voice
transcription) runs locally on your device using
AMD's open-source ROCm stack and free, quantized
language models.

**The result:** A zero-cost AI workspace that works
when the WiFi goes down, remembers everything your
team has ever created, and gets faster when it detects
an AMD GPU.

---

## Architecture

<!-- ARCHITECTURE DIAGRAM PLACEHOLDER -->
<!-- Replace this comment with your diagram image -->
<img src="assets/RyFlow_systemarchitecture.png" alt="RyFlow System Architecture" width="100%" />

> See [ARCHITECTURE.md](ARCHITECTURE.md) for the
> full system design.

---

## Features

| Feature | Description |
|---|---|
| **Local AI** | Phi-3 Mini / Gemma 2B via Ollama - runs entirely on-device |
| **AMD ROCm** | Auto-detects AMD GPU and switches to hardware-accelerated inference |
| **P2P Collaboration** | Real-time co-editing over LAN via WebRTC + Y.js CRDTs |
| **Knowledge Graph** | Semantic vector search over all workspace content |
| **Document Editor** | TipTap rich text editor with AI writing assistance |
| **Code Editor** | Monaco editor with AI explain, debug, and optimize |
| **Canvas** | Excalidraw-powered freeform drawing with AI description |
| **Task Board** | Natural language task creation - type a sentence, get a Kanban card |
| **AI Studio** | Persistent chat with RAG - answers informed by your workspace |
| **Study Guide** | Auto-generate flashcards, key terms, and quizzes from your docs |
| **Voice Input** | Offline transcription via Whisper.cpp (Ryzen AI NPU accelerated) |
| **Tags** | Tag any item across the workspace for filtered views |
| **Daily Notes** | Auto-created daily scratchpad |
| **Workspace Export** | Export entire workspace as `.ryflow` file, import on any device |
| **LAN Discovery** | Auto-discover teammates on the same network via mDNS |

---

## Tech Stack

| Category | Technologies | 
|---|---|
| **Frontend** | React 18 + Vite, TailwindCSS, TipTap, D3.js, Monaco Editor, Excalidraw, Framer Motion, Zustand | 
| **Backend** | Node.js + Express, Socket.io, better-sqlite3 (SQLite) | 
| **AI Layer** | Ollama (Phi-3 Mini, nomic-embed-text), Whisper.cpp, Pollinations.ai | 
| **AMD Stack** | ROCm (GPU inference), llama.cpp HIP, Ryzen AI SDK + ONNX Runtime (NPU) | 
| **Networking** | WebRTC (simple-peer), Y.js CRDTs, Bonjour/mDNS | 
| **Desktop** | Electron | 
| **Container** | Docker + Docker Compose | 


---

## Quick Start

### Option 1 - Docker (Recommended)

The easiest way to run RyFlow. Downloads Ollama
and the required AI models automatically.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
git clone https://github.com/sh4shv4t/RyFlow.git
cd RyFlow
docker compose up
```

Then open: http://localhost:5173

First run downloads phi3:mini (~2.4GB) and nomic-embed-text (~270MB).
This is a one-time setup. Subsequent starts are instant.

### Option 2 - Native Desktop App

Prerequisites:
- Node.js 18+
- Ollama installed and running

```bash
# 1. Clone the repo
git clone https://github.com/sh4shv4t/RyFlow.git
cd RyFlow

# 2. Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Pull AI models (one-time)
ollama pull phi3:mini
ollama pull nomic-embed-text

# 4. Start Ollama
ollama serve

# 5. Run in development mode
npm run dev
```

### Option 3 - Electron Desktop App

```bash
# After completing Option 2 setup:
npm run electron
```

### AMD ROCm Acceleration (Optional)

If you have an AMD GPU, install ROCm for up to 10x faster AI inference:
- Linux: ROCm Installation Guide
- Windows: ROCm support via WSL2

Ollama will automatically detect and use ROCm.
RyFlow shows `⚡ AMD` in the top bar when active.

### Voice Input (Optional)

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make
bash ./models/download-ggml-model.sh base
```

---

## Development

```bash
# Run backend and frontend together
npm run dev

# Backend only (port 3001)
npm run dev:backend

# Frontend only (port 5173)
npm run dev:frontend

# Run tests
npm --prefix frontend test -- --run

# Build for production
npm --prefix frontend run build
```


## How It Works

### Local AI

RyFlow runs Phi-3 Mini via Ollama entirely on your device.
No data leaves your machine. Every chat, summarization,
and task parse happens locally. When an AMD GPU with ROCm
is detected, inference is automatically offloaded to the GPU.

### Knowledge Graph

Every document, task, code file, canvas, and chat is converted
into a 768-dimension vector embedding using nomic-embed-text.
These are stored in SQLite as binary Float32 buffers.
Semantic search uses cosine similarity to find related content
across your entire workspace history.

### P2P Collaboration

Teammates on the same WiFi network are discovered automatically
via mDNS. Documents sync in real-time using WebRTC data channels
and Y.js CRDTs - the same conflict-free merging algorithm used by
Google Docs, but with no Google server in the middle.

### Workspace Portability

Export your entire workspace as a `.ryflow` file (a zip containing
the SQLite database + uploads). Import it on any device to continue
where you left off. The institutional memory never dies when a batch
graduates.

---

## Contributing

Contributions are welcome. Please open an issue before
submitting a pull request for large changes.

```bash
# Fork, clone, then:
git checkout -b feature/your-feature-name

# Make changes
npm --prefix frontend test -- --run

git commit -m "feat: your feature description"
git push origin feature/your-feature-name

# Open a Pull Request
```

---

## License

MIT - see LICENSE for details.

---

<div align="center">
Built with ❤️ for AMD's Slingshot Hackathon
RyFlow - Don't rent intelligence. Run it.
</div>

