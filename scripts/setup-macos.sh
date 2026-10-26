#!/usr/bin/env bash
# Prépare un poste macOS pour développer HERMES : vérifie les prérequis, crée le
# venv backend, installe les dépendances npm et (option) Chromium pour Playwright.
#
# Usage : ./scripts/setup-macos.sh [--playwright]
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

[[ "$(uname -s)" == "Darwin" ]] || avert "This script targets macOS; continuing anyway."

manque=0
verifier() { # verifier <commande> <conseil d'installation>
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1: $(command -v "$1")"
  else
    avert "$1 missing — $2"
    manque=1
  fi
}

info "Checking prerequisites"
if xcode-select -p >/dev/null 2>&1; then
  ok "Xcode Command Line Tools: $(xcode-select -p)"
else
  avert "Xcode Command Line Tools missing — xcode-select --install"
  manque=1
fi
PY="$(trouver_python)" && ok "python: $PY ($("$PY" --version))"
verifier node "brew install node (Node 20+)"
verifier npm "installed with Node"
verifier cargo "curl https://sh.rustup.rs -sSf | sh"
if OLLAMA="$(trouver_ollama)"; then
  ok "ollama: $OLLAMA"
else
  avert "Ollama missing — download the app from https://ollama.com/download (or: brew install ollama)"
  manque=1
fi

info "Backend (Python venv)"
preparer_venv

info "Frontend (npm)"
cd "$FRONTEND" || exit 1
npm ci

if [[ "${1:-}" == "--playwright" ]]; then
  info "Chromium for Playwright (~150 MB, private ARGOS portals only)"
  "$BACKEND/.venv/bin/python" -m playwright install chromium
fi

echo
if (( manque )); then
  avert "Some prerequisites are missing (see above)."
fi
cat <<'TXT'
Next steps (one terminal each):
  ./scripts/start-pythia.sh      # PYTHIA / Ollama
  ./scripts/start-backend.sh     # FastAPI on 127.0.0.1:8000
  ./scripts/start-desktop.sh     # Tauri window (or: cd frontend && npm run dev)
Build the macOS app + DMG:
  ./scripts/build-macos.sh
TXT
