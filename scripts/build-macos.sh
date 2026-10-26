#!/usr/bin/env bash
# Construit HERMES.app et HERMES-<version>-macos-<arch>.dmg (macOS 11+).
#
# Pipeline :
#   1. backend autonome (PyInstaller)          → backend/dist/backend/
#   2. app Tauri release (`tauri build`)        → …/bundle/macos/HERMES.app
#   3. backend copié dans HERMES.app/Contents/Resources/backend (ditto : liens
#      symboliques et signatures conservés)
#   4. signature : ad hoc par défaut, Developer ID si APPLE_SIGNING_IDENTITY
#   5. image disque compressée                  → installer/dist/
#   6. si TAURI_SIGNING_PRIVATE_KEY est défini : archive de mise à jour
#      HERMES_<version>_<arch>.app.tar.gz + signature .sig (plugin updater)
#
# Ollama n'est pas embarqué : l'utilisateur installe l'app Ollama (ollama.com),
# que HERMES détecte et démarre au besoin.
#
# Options : --skip-backend (réutilise backend/dist), --skip-app (réutilise l'app).
# shellcheck source=lib/commun.sh
. "$(dirname "$0")/lib/commun.sh"

[[ "$(uname -s)" == "Darwin" ]] || fatal "build-macos.sh must run on macOS."

SKIP_BACKEND=0
SKIP_APP=0
for arg in "$@"; do
  case "$arg" in
    --skip-backend) SKIP_BACKEND=1 ;;
    --skip-app) SKIP_APP=1 ;;
    *) fatal "Unknown option: $arg" ;;
  esac
done

for outil in node npm cargo ditto codesign hdiutil; do
  command -v "$outil" >/dev/null 2>&1 || fatal "Missing tool: $outil"
done

VERSION="$(version_hermes)"
ARCH="$(uname -m)"   # arm64 (Apple Silicon) ou x86_64 (Intel)
IDENTITE="${APPLE_SIGNING_IDENTITY:--}"
CIBLE_CARGO="${CARGO_TARGET_DIR:-$FRONTEND/src-tauri/target}"
APP="$CIBLE_CARGO/release/bundle/macos/HERMES.app"
SORTIE="$RACINE/installer/dist"
DMG="$SORTIE/HERMES-$VERSION-macos-$ARCH.dmg"

# 1. Backend
if (( SKIP_BACKEND == 0 )); then
  "$RACINE/scripts/build-backend.sh"
fi
[[ -x "$BACKEND/dist/backend/backend" ]] || fatal "Bundled backend missing: run without --skip-backend"

# 2. App Tauri (le bundle .app seul : le DMG est fait plus bas, une fois le backend ajouté)
if (( SKIP_APP == 0 )); then
  info "Building the Tauri app (release, 5-10 min the first time)"
  cd "$FRONTEND" || exit 1
  [[ -d node_modules ]] || npm ci
  npm run tauri -- build --bundles app
fi
[[ -d "$APP" ]] || fatal "App bundle not found: $APP"

# 3. Backend embarqué dans les ressources du bundle
info "Embedding the backend into HERMES.app"
RESSOURCES="$APP/Contents/Resources"
rm -rf "$RESSOURCES/backend"
ditto "$BACKEND/dist/backend" "$RESSOURCES/backend"

# 4. Signature (après toute modification du bundle)
if [[ "$IDENTITE" == "-" ]]; then
  info "Ad-hoc signing (local build — see docs/macos.md for Gatekeeper)"
  codesign --force --deep --sign - "$APP"
else
  info "Signing with: $IDENTITE (Hardened Runtime)"
  codesign --force --deep --timestamp --options runtime \
    --entitlements "$FRONTEND/src-tauri/macos/HERMES.entitlements" \
    --sign "$IDENTITE" "$APP"
fi
codesign --verify --deep --strict "$APP"
ok "Signature verified"

# 5. Image disque : l'app + un raccourci vers /Applications
info "Creating the disk image"
mkdir -p "$SORTIE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ditto "$APP" "$TMP/HERMES.app"
ln -s /Applications "$TMP/Applications"
rm -f "$DMG"
hdiutil create -volname "HERMES $VERSION" -srcfolder "$TMP" -ov -format UDZO "$DMG" >/dev/null
if [[ "$IDENTITE" != "-" ]]; then
  codesign --force --timestamp --sign "$IDENTITE" "$DMG"
fi

# 6. Archive de mise à jour intégrée, signée (clé minisign du plugin updater).
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  case "$ARCH" in arm64) ARCH_TAURI=aarch64 ;; *) ARCH_TAURI="$ARCH" ;; esac
  ARCHIVE="$SORTIE/HERMES_${VERSION}_${ARCH_TAURI}.app.tar.gz"
  info "Creating the signed update archive"
  # Certains formulaires refusent les « = » finaux du base64 : on retire les
  # blancs et on rétablit le padding avant que Tauri ne décode la clé.
  CLE="${TAURI_SIGNING_PRIVATE_KEY//[[:space:]]/}"
  while (( ${#CLE} % 4 )); do CLE+="="; done
  (( ${#CLE} == ${#TAURI_SIGNING_PRIVATE_KEY} )) || ok "Signing key padding restored"
  export TAURI_SIGNING_PRIVATE_KEY="$CLE"
  rm -f "$ARCHIVE" "$ARCHIVE.sig"
  COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" -C "$(dirname "$APP")" HERMES.app
  (cd "$FRONTEND" && npm run --silent tauri -- signer sign "$ARCHIVE" >/dev/null)
  [[ -s "$ARCHIVE.sig" ]] || fatal "Update archive signature missing: $ARCHIVE.sig"
  ok "Update: $ARCHIVE (+ .sig)"
else
  avert "TAURI_SIGNING_PRIVATE_KEY not set: no in-app update archive (see docs/macos.md)"
fi

ok "App : $APP"
ok "DMG : $DMG ($(du -h "$DMG" | cut -f1))"
