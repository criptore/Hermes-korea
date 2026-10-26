#!/usr/bin/env bash
# Démarre PYTHIA (Ollama) s'il ne tourne pas déjà — équivalent de start-pythia.ps1.
# Sous macOS, l'app Ollama lance souvent son serveur à l'ouverture de session :
# dans ce cas on se contente de le vérifier.
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

if port_ouvert 11434; then
  ok "PYTHIA/Ollama already running on 127.0.0.1:11434"
else
  OLLAMA="$(trouver_ollama)" || fatal "Ollama not found. Install it: https://ollama.com/download (or: brew install ollama)"
  mkdir -p "$RACINE/data/logs"
  info "Starting PYTHIA ($OLLAMA serve)"
  nohup "$OLLAMA" serve >"$RACINE/data/logs/ollama.log" 2>&1 &
  attendre_port 11434 25 || fatal "PYTHIA did not answer on 11434 (see data/logs/ollama.log)"
  ok "PYTHIA ready (PID $!)"
fi
curl -fsS http://127.0.0.1:11434/api/tags
echo
