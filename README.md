# Agentverse UML Website Scaffold

This repository is now split into a dedicated frontend and backend to make the architecture explicit.

## Project structure

- `frontend/` — Next.js user interface and Cloudinary-rendered diagram preview pages
- `backend/` — Python FastAPI service with SQLite persistence and Agentverse skill invocation
- `.env.local` — environment variables used by both front and backend

## What changed

- Frontend pages and components moved to `frontend/`
- Backend API logic, models, and integration helpers moved to `backend/`
- `frontend/next.config.js` now proxies `/api/*` calls to `http://localhost:4000`
- Root `package.json` scripts launch the separated frontend and backend

## Run locally

1. Copy `.env.example` to `.env.local`
2. Fill in Cloudinary and Agentverse credentials (SQLite path defaults to `./cartographer.db`)
3. Install dependencies from the repository root:
   - `npm install`
4. Start the frontend:
   - `npm run dev`
4. Install backend Python dependencies:
   - `python3 -m venv backend/.venv`
   - `source backend/.venv/bin/activate`
   - `pip install -r backend/requirements.txt`
5. Start the frontend:
   - `npm run dev`
6. Start the backend in a second terminal:
   - `npm run backend`

## Docker support

The Python backend can also run in Docker:

```bash
cd backend
docker build -t agentverse-uml-backend .
docker run -p 4000:4000 --env-file ../.env.local agentverse-uml-backend
```

## Directory layout

- `frontend/pages/index.js`
- `frontend/pages/login.js`
- `frontend/pages/dashboard.js`
- `frontend/components/DiagramViewer.js`
- `frontend/components/RepoConnector.js`
- `frontend/components/AgentverseConsole.js`
- `frontend/styles/globals.css`
- `frontend/next.config.js`
- `backend/main.py`
- `backend/routes/auth.py`
- `backend/routes/projects.py`
- `backend/routes/agentverse.py`
- `backend/database.py`
- `backend/lib/agentverse.py`
- `backend/requirements.txt`

## Backend capability

The backend now exposes:
- `POST /api/auth`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/agentverse`

This aligns with the separated front/back architecture and keeps the API server distinct from the Next.js UI.
