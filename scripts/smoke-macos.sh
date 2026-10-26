#!/usr/bin/env bash
# Test de fumée du bundle macOS : lance HERMES.app (binaire principal), attend
# que l'app démarre son backend embarqué sur 127.0.0.1:8000, puis tue l'app et
# vérifie que le backend s'arrête de lui-même (surveillance du parent).
#
# Usage : ./scripts/smoke-macos.sh [chemin/vers/HERMES.app]
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

APP="${1:-${CARGO_TARGET_DIR:-$FRONTEND/src-tauri/target}/release/bundle/macos/HERMES.app}"
[[ -x "$APP/Contents/MacOS/hermes" ]] || fatal "App not found: $APP"
[[ -x "$APP/Contents/Resources/backend/backend" ]] || fatal "Bundled backend missing in $APP"
port_ouvert 8000 && fatal "Port 8000 already in use: stop the running HERMES first."

# Données isolées : le test ne touche pas au vrai profil HERMES.
DONNEES="$(mktemp -d)"
trap 'rm -rf "$DONNEES"' EXIT
export HERMES_DATA_DIR="$DONNEES"

info "Starting $APP"
"$APP/Contents/MacOS/hermes" >"$DONNEES/app.log" 2>&1 &
PID_APP=$!

if ! attendre_port 8000 120; then
  cat "$DONNEES/app.log" >&2
  kill "$PID_APP" 2>/dev/null || true
  fatal "The bundled backend did not start within 120 s"
fi
SANTE="$(curl -fsS http://127.0.0.1:8000/health)"
echo "$SANTE"
[[ "$SANTE" == *'"app":"HERMES"'* ]] || fatal "Unexpected /health answer"
[[ -f "$DONNEES/hermes.db" ]] || fatal "MNEMOSYNE not created in HERMES_DATA_DIR"
ok "Backend started by the app, database in the isolated data folder"

info "Killing the app abruptly (SIGKILL)"
kill -9 "$PID_APP"
for _ in $(seq 1 30); do
  port_ouvert 8000 || { ok "Backend stopped on its own after the app died"; exit 0; }
  sleep 1
done
pkill -f "$APP/Contents/Resources/backend/backend" || true
fatal "The backend outlived the app (parent watchdog failed)"
