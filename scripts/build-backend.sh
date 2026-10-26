#!/usr/bin/env bash
# Compile le backend HERMES en exécutable autonome (PyInstaller, mode onedir).
# Équivalent macOS/Linux de build-backend.ps1. Sortie : backend/dist/backend/backend
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

preparer_venv
PY="$BACKEND/.venv/bin/python"
if ! "$PY" -c "import PyInstaller" 2>/dev/null; then
  info "Installing PyInstaller"
  "$PY" -m pip install "pyinstaller==6.11.1"
fi

cd "$BACKEND" || exit 1
info "Building the backend (PyInstaller, 1-3 min)"
"$PY" -m PyInstaller hermes_entry.spec --noconfirm --distpath dist --workpath build

SORTIE="$BACKEND/dist/backend"
[[ -x "$SORTIE/backend" ]] || fatal "Build failed: $SORTIE/backend missing"

# Hygiène : jamais d'artefact runtime (BDD, journaux, clé maître) dans le bundle
# s'il a été lancé depuis le dossier de build (issue #8).
for artefact in data logs storage master.key; do
  if [[ -e "$SORTIE/$artefact" ]]; then
    avert "Removing runtime artefact from the build: $SORTIE/$artefact"
    rm -rf "${SORTIE:?}/$artefact"
  fi
done
find "$SORTIE" \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' \) -print -delete

ok "Backend ready: $SORTIE/backend ($(du -sh "$SORTIE" | cut -f1))"
