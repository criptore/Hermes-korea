#!/usr/bin/env bash
# Propage une version unique à tous les fichiers qui la déclarent — équivalent
# de sync-version.ps1 (mêmes cibles, y compris HERMES.iss).
#
# Usage :
#   ./scripts/sync-version.sh 1.0.2
#   ./scripts/sync-version.sh --check     # vérifie la cohérence sans écrire
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

command -v python3 >/dev/null 2>&1 || fatal "python3 required"
cd "$RACINE" || exit 1
exec python3 - "$@" <<'PY'
import re, sys
from pathlib import Path

# (chemin, regex ancrée, gabarit) — garder aligné avec scripts/sync-version.ps1.
CIBLES = [
    ("backend/hermes/__init__.py", r'(?m)^__version__ = "[^"]*"', '__version__ = "{0}"'),
    ("backend/pyproject.toml", r'(?m)^version = "[^"]*"', 'version = "{0}"'),
    ("frontend/package.json", r'"version": "[^"]*"', '"version": "{0}"'),
    ("frontend/package-lock.json", r'(?m)^  "version": "[^"]*"', '  "version": "{0}"'),
    ("frontend/package-lock.json", r'(?m)^      "version": "[^"]*"', '      "version": "{0}"'),
    ("frontend/src-tauri/tauri.conf.json", r'"version": "[^"]*"', '"version": "{0}"'),
    ("frontend/src-tauri/Cargo.toml", r'(?m)^version = "[^"]*"', 'version = "{0}"'),
    ("installer/HERMES.iss", r'#define MyAppVersion "[^"]*"', '#define MyAppVersion "{0}"'),
]

def version_de(texte, motif):
    m = re.search(motif, texte)
    v = m and re.search(r"\d+\.\d+\.\d+", m.group(0))
    return v.group(0) if v else None

args = sys.argv[1:]
if args == ["--check"]:
    versions = set()
    for chemin, motif, _ in CIBLES:
        v = version_de(Path(chemin).read_text(encoding="utf-8"), motif)
        print(f"  {chemin:<40} {v}")
        versions.add(v)
    if len(versions) == 1:
        print(f"==> Versions consistent: {versions.pop()}")
        sys.exit(0)
    print("[FATAL] Versions out of sync.", file=sys.stderr)
    sys.exit(1)

if len(args) != 1 or not re.fullmatch(r"\d+\.\d+\.\d+", args[0]):
    print("Usage: ./scripts/sync-version.sh <X.Y.Z> | --check", file=sys.stderr)
    sys.exit(1)

version = args[0]
for chemin, motif, gabarit in CIBLES:
    p = Path(chemin)
    texte = p.read_text(encoding="utf-8")
    nouveau = re.sub(motif, gabarit.format(version), texte, count=1)
    if nouveau != texte:
        p.write_text(nouveau, encoding="utf-8")
        print(f"  updated  : {chemin} -> {version}")
    else:
        print(f"  unchanged: {chemin}")
print(f"==> Version {version} propagated. Run 'cargo build' to refresh Cargo.lock.")
PY
