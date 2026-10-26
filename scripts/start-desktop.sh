#!/usr/bin/env bash
# Fenêtre desktop Tauri en mode dev (Vite + Rust) — équivalent de start-desktop.ps1.
# En dev, Tauri ne lance ni le backend ni PYTHIA : utiliser start-backend.sh et
# start-pythia.sh dans d'autres terminaux.
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

command -v cargo >/dev/null 2>&1 || fatal "Rust not found: https://rustup.rs"
cd "$FRONTEND" || exit 1
[[ -d node_modules ]] || npm ci
exec npm run tauri -- dev
