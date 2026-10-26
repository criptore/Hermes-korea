#!/usr/bin/env bash
# Backend HERMES en mode dev (hot reload) — équivalent macOS/Linux de start-backend.ps1.
# Données dans ./data du dépôt (comme sous Windows), API sur 127.0.0.1:8000 uniquement.
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

export HERMES_DB_PATH="$RACINE/data/hermes.db"
export HERMES_STORAGE_PATH="$RACINE/data/storage"
export HERMES_LOG_PATH="$RACINE/data/logs"
export HERMES_MASTER_KEY_PATH="$RACINE/data/master.key"

preparer_venv
cd "$BACKEND" || exit 1
info "HERMES backend on http://127.0.0.1:8000 (Ctrl+C to stop)"
exec .venv/bin/python -m uvicorn hermes.main:app --host 127.0.0.1 --port 8000 --reload
