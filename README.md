# due-track

A local-first, single-user deadline and obligation tracker.

- Backend: Python 3.12+, FastAPI, SQLite
- Frontend: React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui

## Layout

```text
backend/            FastAPI API, SQLite storage, domain logic
frontend/           React single-page app
specs/              Product specification and implementation plan
contracts/          OpenAPI contract
```

## Install

```bash
cd backend
uv sync

cd ../frontend
npm install
```

## Run

Start the API:

```bash
cd backend
uv run uvicorn due_track.api.app:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`.

For a production-style build:

```bash
cd frontend
npm run build

cd ../backend
uv run python -m due_track.main
```

## Configuration

The backend reads `DUE_TRACK_DB_PATH`, `DUE_TRACK_TIMEZONE`, `DUE_TRACK_CURRENCY`,
`DUE_TRACK_HOST`, `DUE_TRACK_PORT`, and the optional `DUE_TRACK_NOW_OVERRIDE`. See
`specs/001-due-track-v1/quickstart.md` for defaults and details.

## Quality Gates

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src

cd ../frontend
npm run test:run
npm run build
```
