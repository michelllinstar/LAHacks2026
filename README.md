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

## MCP server — let any AI agent drive Cartographer

The backend ships an MCP stdio server (`backend/mcp/server.py`) that exposes
six tools: `index_directory`, `find_relevant_context`, `trace_data_flow`,
`find_invariants`, `describe_architecture`, `find_exemplars`. An agent's
typical flow is `index_directory(path)` → query tools against the returned
`repo_hash`.

`scripts/mcp_launcher.sh` is a wrapper that resolves the repo root, pins the
Python interpreter, and clears `MCP_SHARED_SECRET` so dev clients don't get
rejected. Use it as the `command` for any MCP host.

### Claude Code CLI

```bash
claude mcp add cartographer --scope user -- \
  /Users/benjaminhuang/gitssh/LAHacks2026/scripts/mcp_launcher.sh
```

Verify with `/mcp` inside a new `claude` session — six tools should be listed.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cartographer": {
      "command": "/Users/benjaminhuang/gitssh/LAHacks2026/scripts/mcp_launcher.sh"
    }
  }
}
```

Quit and relaunch Claude Desktop. The hammer/tools menu shows the six tools.

### Cursor / other MCP hosts

Same `command` path; no args or env required. Restart the host after adding.

### Agent prompt to test

In a fresh session:

> Use cartographer to index `/Users/benjaminhuang/gitssh/cart-testapp`, then call `find_relevant_context` for "how does login work" and summarize the top symbols.

The repo also appears at `http://localhost:3000/dashboard` after indexing
because the MCP tool writes to the same Mongo the website reads from.

### Prereqs

- `mongod` running locally (`bash scripts/mongo_local.sh start`)
- `.env` populated (`MONGODB_URI`, `GEMINI_API_KEY`, etc.)
- Python deps installed in the interpreter the launcher uses
  (defaults to `/opt/anaconda3/bin/python` — override with
  `CARTOGRAPHER_PYTHON=/path/to/python`)

### Re-enabling auth

The launcher blanks `MCP_SHARED_SECRET` so dev clients work. To require a
shared secret in production, export a non-empty value in the host's env
before launching the MCP server; tool calls will then need to pass
`__secret__: "<value>"` in their `arguments`.

## Backend capability

The backend now exposes:
- `POST /api/auth`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/agentverse`

This aligns with the separated front/back architecture and keeps the API server distinct from the Next.js UI.
