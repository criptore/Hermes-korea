#!/usr/bin/env bash
# Arrête les processus HERMES restés en vie (backend dev, backend embarqué, app).
# Ollama n'est arrêté qu'avec --ollama : sous macOS il appartient souvent à l'app Ollama.
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

arreter() { # arreter <motif pgrep -f> <libellé>
  local pids
  pids="$(pgrep -f "$1" || true)"
  if [[ -z "$pids" ]]; then
    printf '  %s: no running instance\n' "$2"
    return
  fi
  # shellcheck disable=SC2086  # un PID par mot
  kill $pids 2>/dev/null && printf '  %s: stopped PID(s) %s\n' "$2" "${pids//$'\n'/ }"
}

info "Stopping HERMES processes"
arreter "uvicorn hermes.main" "Dev backend"
arreter "HERMES.app/Contents/Resources/backend/backend" "Bundled backend"
arreter "HERMES.app/Contents/MacOS/hermes" "Desktop app"
if [[ "${1:-}" == "--ollama" ]]; then
  arreter "ollama serve" "Ollama/PYTHIA"
fi
ok "Done."
