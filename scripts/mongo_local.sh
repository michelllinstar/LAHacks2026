#!/usr/bin/env bash
# Lifecycle for the portable mongod we unpacked under ~/.cartographer/mongo.
# Avoids brew/Docker — all state lives under that one directory.
#
# Usage:
#   scripts/mongo_local.sh start    # boot mongod (idempotent)
#   scripts/mongo_local.sh stop     # graceful shutdown
#   scripts/mongo_local.sh status   # is it up?
#   scripts/mongo_local.sh tail     # tail the log
#   scripts/mongo_local.sh wipe     # stop + delete data dir (dangerous)

set -euo pipefail

ROOT="${MONGO_LOCAL_ROOT:-$HOME/.cartographer/mongo}"
BIN="$ROOT/server/bin/mongod"
DATA="$ROOT/data"
LOG="$ROOT/log/mongod.log"
PORT="${MONGO_LOCAL_PORT:-27017}"

if [[ ! -x "$BIN" ]]; then
    echo "mongod not found at $BIN" >&2
    echo "Run the bootstrap (downloads ~74MB tarball) first." >&2
    exit 2
fi

mkdir -p "$DATA" "$(dirname "$LOG")"

# Detect mongod by what's listening on $PORT, not by argv shape.
# The portable mongod can be started with relative or absolute paths and we
# want both invocations to round-trip cleanly through start/stop/status.
_mongod_pid() {
    lsof -ti TCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1
}

_mongod_kill() {
    local pid
    pid="$(_mongod_pid)"
    [[ -n "$pid" ]] && kill "$pid" || true
}

case "${1:-}" in
    start)
        if [[ -n "$(_mongod_pid)" ]]; then
            echo "mongod already running"
            exit 0
        fi
        "$BIN" --dbpath "$DATA" --logpath "$LOG" --port "$PORT" --bind_ip 127.0.0.1 --fork
        ;;
    stop)
        if [[ -z "$(_mongod_pid)" ]]; then
            echo "mongod not running"
            exit 0
        fi
        # Prefer graceful shutdown via the admin command.
        python3 - <<EOF || _mongod_kill || true
from pymongo import MongoClient
try:
    MongoClient("mongodb://127.0.0.1:$PORT", serverSelectionTimeoutMS=2000).admin.command({"shutdown": 1})
except Exception:
    pass
EOF
        sleep 1
        if [[ -n "$(_mongod_pid)" ]]; then
            _mongod_kill || true
        fi
        echo "stopped"
        ;;
    status)
        if [[ -n "$(_mongod_pid)" ]]; then
            echo "mongod running on 127.0.0.1:$PORT"
            exit 0
        else
            echo "mongod not running"
            exit 1
        fi
        ;;
    tail)
        exec tail -f "$LOG"
        ;;
    wipe)
        if [[ -n "$(_mongod_pid)" ]]; then
            "$0" stop
        fi
        rm -rf "$DATA"
        echo "wiped $DATA"
        ;;
    *)
        echo "usage: $0 {start|stop|status|tail|wipe}" >&2
        exit 64
        ;;
esac
