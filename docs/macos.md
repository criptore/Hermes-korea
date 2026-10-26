# HERMES on macOS

HERMES runs natively on macOS 11 Big Sur and later, on Apple Silicon (`arm64`)
and Intel (`x86_64`) Macs. The same invariants as on Windows apply: everything
runs locally, the backend only listens on `127.0.0.1`, and submission stays human.

## What differs from Windows

| Topic | Windows | macOS |
|---|---|---|
| Package | `HERMES-Setup-<v>.exe` (Inno Setup, Ollama bundled) | `HERMES-<v>-macos-<arch>.dmg` (Ollama installed separately) |
| App | `C:\Program Files\HERMES\hermes.exe` | `/Applications/HERMES.app` |
| Bundled backend | `backend\backend.exe` next to `hermes.exe` | `HERMES.app/Contents/Resources/backend/backend` |
| User data | `%LocalAppData%\HERMES` | `~/Library/Application Support/HERMES` |
| Ollama models | `%LocalAppData%\HERMES\ollama\models` | `~/.ollama/models` (shared with the Ollama app) |
| Ollama lookup | Program Files, `%LocalAppData%\Programs` | `/Applications/Ollama.app`, `~/Applications/Ollama.app`, `/opt/homebrew/bin`, `/usr/local/bin` |
| Children killed if the app crashes | Job Object “kill-on-close” | backend watchdog (`HERMES_PARENT_PID`) also stops the Ollama HERMES started |
| Tray | notification area, left click opens the window | menu bar icon, click opens its menu; Dock icon reopens a hidden window |
| Dev scripts | `scripts/*.ps1` | `scripts/*.sh` |

`HERMES_BACKEND_EXE`, `HERMES_OLLAMA_EXE`, `HERMES_DATA_DIR` and `OLLAMA_MODELS`
override the defaults on both platforms.

## Installing (end users)

1. Install **Ollama**: <https://ollama.com/download> (drag it to *Applications*),
   or `brew install ollama`. HERMES reuses the Ollama server if it is already
   running, otherwise it starts `ollama serve` itself and stops it on exit.
2. Open `HERMES-<version>-macos-<arch>.dmg` and drag **HERMES** to
   **Applications**. Pick `arm64` for Apple Silicon (M1…M4), `x86_64` for Intel.
3. First launch — the DMG is ad-hoc signed, not notarised by Apple, so
   Gatekeeper blocks it once:
   - macOS 14 and earlier: right-click (or Control-click) **HERMES** → **Open** →
     **Open**.
   - macOS 15 and later: try to open it, then *System Settings → Privacy &
     Security → “HERMES was blocked…” → Open Anyway*.
   - Or, in Terminal: `xattr -dr com.apple.quarantine /Applications/HERMES.app`
4. HERMES shows “Starting…”, then offers to download the Qwen3 8B model
   (~5.2 GB, explicit click). The first start of the bundled backend can take a
   few extra seconds while macOS checks it.

macOS asks once whether HERMES may send notifications (new relevant tender,
response ready, ARGOS failure); they can be toggled in *Settings → Desktop app*.

To uninstall: quit HERMES (menu bar icon → *Quit HERMES*, or ⌘Q), move
`HERMES.app` to the Bin, and delete `~/Library/Application Support/HERMES` if you
also want to remove the database and documents.

## Developing on a Mac

```bash
xcode-select --install                 # once, if needed
brew install python@3.12 node          # Python 3.11+ and Node 20+
curl https://sh.rustup.rs -sSf | sh    # Rust (desktop build only)
./scripts/setup-macos.sh               # checks, backend venv, npm ci
```

Then, one terminal each:

```bash
./scripts/start-pythia.sh     # Ollama on 127.0.0.1:11434
./scripts/start-backend.sh    # FastAPI on 127.0.0.1:8000, data in ./data
./scripts/start-desktop.sh    # Tauri dev window (or: cd frontend && npm run dev)
```

`./scripts/kill-hermes.sh` stops leftover HERMES processes (`--ollama` also stops
`ollama serve`). Backend tests: `cd backend && .venv/bin/pytest`.

`setup-macos.sh --playwright` also installs Chromium for the private-portal
foundation of ARGOS (not needed for BOAMP/TED).

## Building the app and the DMG

```bash
./scripts/build-macos.sh                 # backend + app + DMG
./scripts/build-macos.sh --skip-backend  # reuse backend/dist/backend
./scripts/smoke-macos.sh                 # end-to-end check of the built app
```

The pipeline:

1. `scripts/build-backend.sh` — PyInstaller (`backend/hermes_entry.spec`, onedir)
   → `backend/dist/backend/backend`, runtime artefacts purged.
2. `npm run tauri build -- --bundles app` → `HERMES.app` (icons from
   `src-tauri/icons/icon.icns`, settings in `src-tauri/tauri.macos.conf.json`).
3. The backend is copied with `ditto` into `HERMES.app/Contents/Resources/backend`
   (symlinks and PyInstaller's ad-hoc signatures preserved).
4. `codesign` signs the whole bundle (ad-hoc by default).
5. `hdiutil` builds `installer/dist/HERMES-<version>-macos-<arch>.dmg` with an
   *Applications* shortcut.

The DMG targets the build machine's architecture (the CI builds both). Locally,
build on an Apple Silicon Mac for `arm64` and on an Intel Mac for `x86_64`: a
universal binary would need a universal2 Python for PyInstaller and is left for
later.

`smoke-macos.sh` starts the built app with an isolated data folder, waits for the
bundled backend on `127.0.0.1:8000`, checks `/health` and that MNEMOSYNE was
created, then kills the app with `SIGKILL` and checks that the backend stops on
its own. The *macOS bundle* GitHub workflow (`.github/workflows/macos-bundle.yml`)
runs the build and this smoke test on Apple Silicon and Intel runners and uploads
both DMGs as artifacts. On a `vX.Y.Z` tag, a `release` job publishes them in a
GitHub Release:

```bash
./scripts/sync-version.sh 1.2.0     # then commit, PR, merge
git tag v1.2.0 && git push origin v1.2.0
```

## In-app updates

Once HERMES is installed, new versions install from the app itself:
*Settings → Desktop app → Updates → Check for updates*, then *Install and
restart*. HERMES reads `latest.json` from the latest GitHub Release, downloads the
archive for your Mac (`HERMES_<version>_<aarch64|x86_64>.app.tar.gz`), checks its
**minisign signature** against the public key embedded in the app
(`plugins.updater` in `tauri.conf.json`), replaces `HERMES.app`, stops the
backend and PYTHIA and restarts. User data in `~/Library/Application Support/HERMES`
is untouched.

This is HERMES's only network call besides tender portals and consented model
downloads: it only happens when you click *Check for updates*, or at startup if
you enable *Check for updates at startup* (off by default). Nothing about your
data is sent.

### Publishing an update

1. One-time setup — repository secrets (*Settings → Secrets and variables →
   Actions*): `TAURI_SIGNING_PRIVATE_KEY` (content of the private key file) and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The matching public key is already in
   `tauri.conf.json`. Losing the private key means installed apps can no longer
   update (a new key needs a manual DMG install once).
2. `./scripts/sync-version.sh X.Y.Z`, commit, PR, merge.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` — the *macOS bundle* workflow
   builds both architectures, signs the update archives and publishes the DMGs,
   the archives and `latest.json` in the GitHub Release.

Locally, `build-macos.sh` also produces the signed archive when
`TAURI_SIGNING_PRIVATE_KEY` (and its password) are set in the environment.

### Signing and notarisation (optional)

Distributing outside your own machines without the Gatekeeper prompt needs an
Apple Developer ID:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
./scripts/build-macos.sh
xcrun notarytool submit installer/dist/HERMES-*.dmg \
  --apple-id you@example.com --team-id TEAMID --password <app-specific-password> --wait
xcrun stapler staple installer/dist/HERMES-*.dmg
```

With an identity set, the script signs with the Hardened Runtime and
`src-tauri/macos/HERMES.entitlements` (the bundled Python/ONNX libraries need
`disable-library-validation` and `allow-unsigned-executable-memory`).

## Troubleshooting

- **“PYTHIA unavailable”**: Ollama is not installed or not found. Install the
  Ollama app, or point `HERMES_OLLAMA_EXE` at the binary.
- **Port 8000 already in use**: another HERMES (or another service) is running.
  `./scripts/kill-hermes.sh`, or `lsof -iTCP:8000 -sTCP:LISTEN`.
- **Logs of the bundled app**: run it from Terminal to see the backend output:
  `/Applications/HERMES.app/Contents/MacOS/hermes`.
- **Models downloaded twice**: HERMES uses `~/.ollama/models` unless
  `OLLAMA_MODELS` is set; make sure the Ollama app does not use a custom folder.
