# Project Structure

Agentverse UML Studio — a hackathon project (LA Hacks 2026) that lets users connect a Git repository or local schema, render large database UML diagrams via Cloudinary, and query an Agentverse / OmegaClaw skill for reasoning.

## Tech stack

- **Frontend:** Next.js 14 (Pages Router), React 18, axios, SWR
- **Backend:** Python FastAPI + Uvicorn, MongoDB (via `pymongo`), PyJWT, Cloudinary SDK
- **Infra:** Docker (backend), `.env.local` shared by both tiers

## Top-level layout

```
LAHacks2026/
├── frontend/           # Next.js app (UI + API proxy)
├── backend/            # FastAPI service (auth, projects, Agentverse)
├── package.json        # Root scripts: dev / build / backend
├── package-lock.json
├── .env.example        # Template for shared env vars
├── .env.local          # Active env (gitignored in practice)
├── .gitignore          # Python-oriented
├── README.md
├── CLAUDE.md           # Repo guidance for Claude Code
├── LICENSE
└── test.py             # Smoke script ("Hello, LAHacks2026!")
```

## Frontend (`frontend/`)

Next.js Pages Router. The dev server proxies `/api/*` to the FastAPI backend on port 4000 via `next.config.js` rewrites.

```
frontend/
├── next.config.js              # Proxies /api/* → http://localhost:4000, allows res.cloudinary.com images
├── pages/
│   ├── index.js                # Landing / hero with links to Login + Dashboard
│   ├── login.js                # POSTs to /api/auth/login, redirects to /dashboard on success
│   └── dashboard.js            # Loads diagrams from /api/projects, hosts the three panels
├── components/
│   ├── RepoConnector.js        # Form → POST /api/projects (Git URL or local schema URL)
│   ├── DiagramViewer.js        # Renders the selected diagram via next/image (Cloudinary)
│   └── AgentverseConsole.js    # Form → POST /api/agentverse (question + projectContext)
└── styles/
    └── globals.css             # Inter font + dark base theme
```

### Frontend data flow

`Dashboard` fetches `/api/projects` on mount, renders the diagram list, and passes the selected diagram to `DiagramViewer`. `RepoConnector` creates/updates the singleton `default` project. `AgentverseConsole` forwards the user prompt plus the active project to the backend skill route.

## Backend (`backend/`)

FastAPI app with three routers mounted under `/api`. Loads env from the **repo-root** `.env.local` (note `Path(__file__).parent.parent`).

```
backend/
├── main.py                 # FastAPI app, CORS for localhost:3000, mounts /api/{auth,projects,agentverse}
├── database.py             # MongoDB connection helpers (re-exports backend.db.store)
├── models.py               # Pydantic: LoginPayload, ProjectPayload, AgentverseQueryPayload
├── __init__.py             # (empty)
├── requirements.txt        # fastapi, uvicorn, PyJWT, cloudinary, requests, python-dotenv
├── Dockerfile              # python:3.12-slim, exposes 4000, uvicorn entrypoint
└── routes/
    ├── __init__.py         # (empty)
    ├── auth.py             # POST /api/auth/   — hardcoded USERS list, JWT cookie (HS256, 8h)
    ├── projects.py         # GET/POST /api/projects/ — upserts the 'default' project, INSERTs diagram rows
    └── agentverse.py       # POST /api/agentverse/ — delegates to backend.lib.agentverse.query_agentverse
```

### Endpoint summary

| Method | Path                  | Handler                          | Notes                                               |
|--------|-----------------------|----------------------------------|-----------------------------------------------------|
| GET    | `/health`             | `main.health_check`              | Returns `{status: "ok"}`                            |
| POST   | `/api/auth/login`     | `routes.auth.login`              | In-memory user list; sets `agentverse_session` cookie |
| GET    | `/api/projects/`      | `routes.projects.get_projects`   | Returns `diagrams` from the `default` project       |
| POST   | `/api/projects/`      | `routes.projects.add_project`    | Upserts `default`, INSERTs a diagram row            |
| POST   | `/api/agentverse/`    | `routes.agentverse.ask_agentverse` | Calls `query_agentverse(question, projectContext)`  |

## Environment variables (`.env.example`)

```
MONGODB_URI              # Mongo connection string (defaults to mongodb://localhost:27017)
MONGODB_DB_NAME          # Database name (defaults to "cartographer")
JWT_SECRET               # HS256 signing key for session cookies
CLOUDINARY_CLOUD_NAME    # Cloudinary account
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
AGENTVERSE_API_KEY       # OmegaClaw / Agentverse credential
AGENTVERSE_AGENT_ID
```

## Run commands (root `package.json`)

| Script           | Command                                              |
|------------------|------------------------------------------------------|
| `npm run dev`    | `next dev frontend` — Next.js on :3000               |
| `npm run build`  | `next build frontend`                                |
| `npm run start`  | `next start frontend`                                |
| `npm run backend`| `uvicorn backend.main:app --reload --port 4000`      |
| `npm run lint`   | `eslint . --ext .js,.jsx`                            |

