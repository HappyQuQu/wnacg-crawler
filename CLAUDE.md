# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WNACG Downloader is a local download hub for a manga image site. Three components:
- **Backend** (Python FastAPI) -- core product, task pipeline, database, crawler
- **Frontend** (React + Vite + TypeScript) -- web admin UI
- **Extension** (Chrome Manifest V3) -- browser entry point for submitting tasks

## Commands

### Backend (Python)

```bash
pip install -e ".[dev]"                  # Install in editable mode
alembic upgrade head                     # Run DB migrations
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8080  # Dev server

.venv/bin/ruff check backend             # Lint
.venv/bin/mypy backend                   # Type check
.venv/bin/pytest -q                      # Run tests
.venv/bin/python -m compileall backend   # Bytecode check
```

### Frontend

```bash
npm run dev:frontend                     # Vite dev server (port 5173)
npm run build:frontend                   # Production build
npm run lint -w frontend                 # ESLint
```

### Extension

```bash
npm run build:extension                  # Compile TypeScript
npm run package:extension                # Build + zip to dist/
npm run typecheck:extension              # Type check only
```

### Full Validation

```bash
npm run validate                         # Runs all lints, type checks, tests, and builds
```

## Architecture

### Backend Layers (`backend/app/`)

- **`api/`** -- Route handlers. Only handle request/response, parameter forwarding, HTTP errors.
- **`services/`** -- Business orchestration. `TaskRunner` drives the full download pipeline and broadcasts WebSocket progress.
- **`db/`** -- SQLAlchemy async models (7 tables) and repository pattern for data access.
- **`crawler/`** -- Remote fetching (`smart_fetcher.py` with HTTP-first + Playwright fallback), HTML parsing (`parser.py`), image downloading (`downloader.py`), rate limiting, Cloudflare detection.
- **`core/`** -- Pydantic Settings (env vars with `WNACG_` prefix + JSON file + defaults), schemas, security, path helpers.

### Task Pipeline (`TaskRunner.run`)

`pending -> queued -> running -> [fetching_info -> fetching_pages -> resolving_images -> downloading -> verifying -> zipping] -> completed/partial/failed`

Control states: `paused`, `cancelled`. Failed/partial tasks can be retried back to `queued`.

### Fetch Strategy

Configurable mode (`http`/`browser`/`auto`). In `auto` mode, HTTP is tried first; Cloudflare challenges trigger Playwright fallback. Domain-level rate limiting and 403 backoff.

### Frontend Structure (`frontend/src/`)

- **`pages/`** -- Dashboard, Queue, Library, Settings
- **`hooks/`** -- `useTasks`, `useLibrary`, `useLogs`, `useConfig`, `useWebSocket` (auto-reconnect + 5s polling fallback)
- **`api.ts`** -- Fetch wrappers for all backend endpoints
- **`styles.css`** -- Apple-style design system

### Real-time Updates

Backend broadcasts via `WS /ws/progress`. Frontend `useWebSocket` hook handles reconnection; falls back to polling when disconnected.

### Configuration

Three-source merge: env vars (`WNACG_` prefix) > `config/config.local.json` > built-in defaults. Hot-reloadable via `/api/config`.

## Engineering Rules

### Backend Boundaries
- API layer: request/response only, no business logic
- Services: orchestration and state transitions
- Repositories: all DB access
- Crawler: all remote HTTP and HTML parsing
- `TaskRunner` owns progress writes and WebSocket broadcasts

### Frontend Boundaries
- All state must come from the API -- no mock/fake task data
- Apple-style UI: restrained, clear, moderate information density
- Use `lucide-react` icons, not emoji for UI icons
- Key operations must have disabled/loading states

### Extension Boundaries
- Only does: identify manga IDs on pages, check backend status, submit tasks, open admin page
- Never does: download images, write DB, write files, create ZIPs, bypass backend security

### Data Rules
- File paths: `data/Manga/[{id}] {title}/{0001}_{pic_num}.jpg`, `data/Zip/[{id}] {title}.zip`
- Completion requires: full metadata, all pages resolved, all images downloaded and verified, ZIP successful (or disabled)
- Incomplete downloads must be `partial` or `failed`, never `completed`
- File operations must be idempotent: re-runs only fill gaps, never destroy valid files
- Task failures must be recoverable with visible error reasons and retry entry points
- Directories always include manga ID to prevent name collisions

### Smoke Testing
Create tasks with `start_immediately: false` by default. Only trigger real downloads with user-provided IDs and explicit consent.

## Key Files

| File | Role |
|---|---|
| `backend/app/services/task_runner.py` | Full download pipeline orchestration |
| `backend/app/crawler/smart_fetcher.py` | HTTP-first with browser fallback |
| `backend/app/crawler/parser.py` | All HTML parsing logic |
| `backend/app/core/config.py` | Pydantic Settings with 3-source merge |
| `backend/app/db/models.py` | 7 SQLAlchemy ORM tables |
| `backend/app/main.py` | FastAPI app factory and lifespan |
| `frontend/src/main.tsx` | App root, view routing, WebSocket setup |
| `frontend/src/api.ts` | All API fetch wrappers |
| `frontend/src/hooks/useWebSocket.ts` | WebSocket with auto-reconnect + polling fallback |

## Documentation

Product and technical docs are in `docs/`: `PRD.md`, `ARCHITECTURE.md`, `API.md`, `DATA_MODEL.md`, `FLOWS.md`, `UI_SPEC.md`, `PROGRESS.md`.

## Dev Defaults

- Backend: `http://127.0.0.1:8080`
- Frontend dev server: `http://127.0.0.1:5173` (proxies `/api` and `/ws` to backend)
- Backend listens on localhost only. Do not change to LAN/public unless explicitly requested.

## Docker Workflow

User tests everything through Docker. After **every** frontend or backend code change, rebuild and restart the container:

```bash
docker compose up --build -d
```
