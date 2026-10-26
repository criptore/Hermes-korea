# shellcheck shell=bash disable=SC2034  # RACINE/BACKEND/FRONTEND servent aux scripts appelants
# Fonctions partagées des scripts shell HERMES (macOS / Linux).
# À sourcer : . "$(dirname "$0")/lib/commun.sh"

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$RACINE/backend"
FRONTEND="$RACINE/frontend"

info()  { printf '\033[36m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[32m    %s\033[0m\n' "$*"; }
avert() { printf '\033[33m[WARN] %s\033[0m\n' "$*" >&2; }
fatal() { printf '\033[31m[FATAL] %s\033[0m\n' "$*" >&2; exit 1; }

# Python >= 3.11 (3.12 recommandé). Respecte $HERMES_PYTHON s'il est défini.
trouver_python() {
  if [[ -n "${HERMES_PYTHON:-}" ]]; then
    command -v "$HERMES_PYTHON" || fatal "HERMES_PYTHON not found: $HERMES_PYTHON"
    return
  fi
  local candidat
  for candidat in python3.12 python3.11 python3.13 python3; do
    if command -v "$candidat" >/dev/null 2>&1 \
      && "$candidat" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
      command -v "$candidat"
      return
    fi
  done
  fatal "Python >= 3.11 not found (macOS: brew install python@3.12)."
}

# Venv backend prêt (créé au besoin), dépendances installées si requirements.txt a changé.
preparer_venv() {
  local venv="$BACKEND/.venv"
  if [[ ! -x "$venv/bin/python" ]]; then
    info "Creating the backend venv ($(trouver_python))"
    "$(trouver_python)" -m venv "$venv"
  fi
  local tampon="$venv/.requirements.sha256"
  local empreinte
  empreinte="$(shasum -a 256 "$BACKEND/requirements.txt" | cut -d' ' -f1)"
  if [[ ! -f "$tampon" || "$(cat "$tampon")" != "$empreinte" ]]; then
    info "Installing Python dependencies"
    "$venv/bin/python" -m pip install --upgrade pip >/dev/null
    "$venv/bin/python" -m pip install -r "$BACKEND/requirements.txt"
    echo "$empreinte" > "$tampon"
  fi
}

# Binaire Ollama : PATH, puis emplacements usuels (une app lancée depuis le
# Finder n'hérite pas du PATH du shell, d'où la liste explicite).
trouver_ollama() {
  if [[ -n "${HERMES_OLLAMA_EXE:-}" && -x "$HERMES_OLLAMA_EXE" ]]; then
    echo "$HERMES_OLLAMA_EXE"; return
  fi
  if command -v ollama >/dev/null 2>&1; then command -v ollama; return; fi
  local candidat
  for candidat in \
    "/Applications/Ollama.app/Contents/Resources/ollama" \
    "$HOME/Applications/Ollama.app/Contents/Resources/ollama" \
    "/opt/homebrew/bin/ollama" \
    "/usr/local/bin/ollama" \
    "/usr/bin/ollama"; do
    if [[ -x "$candidat" ]]; then echo "$candidat"; return; fi
  done
  return 1
}

port_ouvert() { # port_ouvert 8000
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

attendre_port() { # attendre_port 11434 25
  local port="$1" delai="${2:-30}" t=0
  while (( t < delai * 2 )); do
    port_ouvert "$port" && return 0
    sleep 0.5; t=$((t + 1))
  done
  return 1
}

# Version de l'app (source : backend/hermes/__init__.py, synchronisée partout).
version_hermes() {
  sed -n 's/^__version__ = "\(.*\)"/\1/p' "$BACKEND/hermes/__init__.py"
}
