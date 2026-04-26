# Codebase Cartographer

A four-layer semantic index over a source repository, exposed as a FastAPI
backend, a Next.js visualization frontend, and an MCP stdio server. Cartographer
replaces blind grep-and-read exploration by AI coding agents with structured,
conventionally-grounded context bundles: symbols and references, data flows,
architectural roles, and implicit invariants.

See `SPEC.md` for the full design and `STRUCTURE.md` for a directory map.

## Project structure

- `backend/` — FastAPI service, indexer, agents, MCP server (Python 3.12)
- `frontend/` — Next.js UI with Cytoscape graph views and SSE live updates
- `scripts/` — local mongod lifecycle wrapper, MCP launcher, helpers
- `tests/` — pytest suite (hermetic by default; live-Mongo opt-in)
- `.env` / `.env.local` — environment configuration (gitignored)

## Stack

- **Backend**: FastAPI, uvicorn, pymongo, tree-sitter, sentence-transformers
  (`all-MiniLM-L6-v2`, 384-dim), Gemini via `google-genai`
- **Storage**: MongoDB 7 (local tarball or Atlas) — symbols, refs, flows,
  clusters, invariants, embeddings as `BinData`. `$text` index over
  qualified names and signatures; cosine similarity computed in-process.
- **Frontend**: Next.js, Cytoscape.js + cytoscape-dagre, SSE event stream
- **Auth**: JWT in `agentverse_session` cookie; `CARTOGRAPHER_DEV=1` accepts
  the dev secret for local work

## Run locally

### 1. Configure environment

Copy `.env.example` to `.env` and fill in:

- `MONGODB_URI` (default `mongodb://localhost:27017`)
- `MONGODB_DB_NAME` (default `cartographer`)
- `JWT_SECRET` (`dev-secret-token` is accepted when `CARTOGRAPHER_DEV=1`)
- `GEMINI_API_KEY` for LLM annotation (Layer 3/4)

`.env.local` overrides `.env`; OS environment overrides both.

### 2. Start MongoDB

```bash
bash scripts/mongo_local.sh start    # starts the portable mongod
bash scripts/mongo_local.sh status   # check listener
bash scripts/mongo_local.sh stop
```

The script manages a MongoDB Community 7 tarball under
`~/.cartographer/mongo/`. Atlas works too — just point `MONGODB_URI` at the
SRV connection string.

### 3. Install dependencies

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
npm install
```

### 4. Start the services

```bash
npm run backend   # FastAPI on :4000
npm run dev       # Next.js on :3000
```

Visit `http://localhost:3000`, log in with the dev credentials, register a
repository path, and watch the four layers populate over SSE.

## API surface

- `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/repos`, `POST /api/repos`, `GET /api/repos/{hash}`
- `POST /api/repos/{hash}/index` — kick off indexing
- `GET  /api/repos/{hash}/graph` — graph snapshot for the FlowView
- `POST /api/query/find_relevant_context`
- `POST /api/query/trace_data_flow`
- `POST /api/query/find_invariants`
- `POST /api/query/describe_architecture`
- `POST /api/query/find_exemplars`
- `GET  /api/stream/{hash}` — SSE channel for index + agent events
- `GET  /health` — liveness + Mongo reachability probe

## Tests

```bash
pytest tests/ -q                                              # hermetic suite
MONGODB_URI=mongodb://localhost:27017 \
    pytest tests/test_store_live.py -v                        # live round-trip
```

The hermetic suite uses the sentinel URI `mongodb://localhost:0` and a
`MagicMock` store; `test_store_live.py` is module-skipped unless a real URI
is provided. The test DB defaults to `cartographer_test` so a stray run
never clobbers the developer's main database.

## MCP server — let any AI agent drive Cartographer

The backend ships an MCP stdio server (`backend/mcp/server.py`) exposing
six tools: `index_directory`, `find_relevant_context`, `trace_data_flow`,
`find_invariants`, `describe_architecture`, `find_exemplars`. Typical flow:
`index_directory(path)` → query tools against the returned `repo_hash`.

`scripts/mcp_launcher.sh` resolves the repo root, pins the Python
interpreter, and clears `MCP_SHARED_SECRET` so dev clients aren't rejected.
Use it as the `command` for any MCP host.

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

> Use cartographer to index `/Users/benjaminhuang/gitssh/cart-testapp`, then
> call `find_relevant_context` for "how does login work" and summarize the
> top symbols.

The repo also appears at `http://localhost:3000/dashboard` after indexing
because the MCP tool writes to the same Mongo the website reads from.

### Prereqs

- `mongod` running locally (`bash scripts/mongo_local.sh start`) or an Atlas URI
- `.env` populated (`MONGODB_URI`, `GEMINI_API_KEY`, etc.)
- Python deps installed in the interpreter the launcher uses
  (defaults to `/opt/anaconda3/bin/python` — override with
  `CARTOGRAPHER_PYTHON=/path/to/python`)

### Re-enabling auth

The launcher blanks `MCP_SHARED_SECRET` so dev clients work. To require a
shared secret in production, export a non-empty value in the host's env
before launching the MCP server; tool calls will then need to pass
`__secret__: "<value>"` in their `arguments`.
