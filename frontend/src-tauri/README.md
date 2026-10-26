# src-tauri/

Tauri (Rust) wrapper that embeds the Vite frontend in a native window and, in
release builds, owns the lifecycle of the backend and PYTHIA (see `src/lib.rs`).

**Prerequisites**: stable Rust (https://rustup.rs/), plus Visual Studio Build
Tools 2022 on Windows or the Xcode Command Line Tools on macOS.

```bash
cd frontend
npm run tauri dev      # dev mode (Vite + Tauri window; start backend/PYTHIA yourself)
npm run tauri build    # desktop bundle (Windows .exe / macOS .app + .dmg / Linux .deb)
```

Full packages, with the bundled PyInstaller backend:
`scripts/build-installer.ps1` (Windows) and `scripts/build-macos.sh` (macOS,
see `docs/macos.md`).

- `tauri.conf.json` — shared configuration; `tauri.macos.conf.json` is merged
  automatically on macOS (`.icns` icon, minimum macOS 11).
- `macos/HERMES.entitlements` — Hardened Runtime entitlements, used only when
  signing with a Developer ID (`APPLE_SIGNING_IDENTITY`).
- `icons/` — `icon.ico` (Windows), `icon.icns` + PNGs (macOS/Linux), generated
  from the same 256 px artwork (`icon.png`).
