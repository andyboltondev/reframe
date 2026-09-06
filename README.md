# Reframe — proof of concept

**Convert. Resize. Optimise.** A batch image converter/resizer that does all
processing locally. This repo currently contains the **web** proof of concept
from the design specification.

```bash
pnpm install
pnpm dev      # http://localhost:5199
pnpm build
```

Native desktop builds for **Windows and macOS** are wired up via Tauri 2 — see
[Desktop builds](#desktop-builds).

## What works today

- Drag-and-drop of files **and folders** (recursive, `webkitGetAsEntry` walk),
  plus file/folder pickers. Unsupported files are counted and ignored.
- Output formats: JPEG, PNG, WebP, AVIF, or *Keep Original*, with a quality
  slider and the Maximum/High/Balanced/Small presets.
- Resize modes: longest side, width & height, width only, height only,
  percentage; optional enlargement (off by default).
- Fit: contain, cover/crop, pad, stretch. Crop anchors including a **smart**
  focal point derived from local-contrast saliency.
- Trim empty space: transparent / white / auto (corner-sampled) with tolerance.
- Subject padding for the product-cutout workflow.
- **Presets.** Four locked built-ins (Web Optimised, Product Square, Social
  Square, Keep Dimensions) plus your own: save the current settings, update,
  rename, delete, and export one or all as JSON. Importing validates every
  field back into range (untrusted JSON never reaches the live settings) and
  pauses on each name clash to offer Overwrite / Add as a numbered copy /
  Cancel, with an "apply to all remaining conflicts" option. Built-in names can
  never be overwritten — an overwrite aimed at one becomes a numbered copy.
- Concurrent processing in a **worker pool** (`cores - 1`, capped at 8) with
  pause / resume / cancel; one failure never stops the batch.
- A live progress panel (count, percent, active/remaining, elapsed and ETA) and
  a completion summary with original/new size, saved bytes, reduction and an
  expandable list of failures.
- Row thumbnails that swap from source to processed result as jobs finish,
  status pills, filtering and sorting; previews can be switched off for very
  large batches.
- Two clearly separated outputs: **Save to folder…** writes straight into a
  folder you pick (File System Access API, including an explicit write-permission
  request), and **Export as ZIP** hands a dependency-free archive that preserves
  relative paths to the browser. Neither uploads anything; failures report the
  real underlying reason rather than a generic message.
- Re-run a finished batch with different settings: the status bar flags
  "Settings changed since this run" and the action becomes **Convert again**.
- An Auto / Light / Dark segmented theme switch, keyboard-navigable controls,
  and persisted settings (never image contents).
- The settings panel is an **accordion**: each section collapses to a one-line
  summary of its current value, and which sections are open is remembered
  between sessions. Preset actions live in a single **Manage** menu, and every
  non-obvious control carries a tooltip explaining what it does.
- A detailed status bar: counts and total size, live throughput in img/s while
  running, final saved-bytes and reduction, plus a chip recap of exactly what
  Convert will do (format, quality, resize mode, trim, worker count).

## Desktop builds

The desktop shell is [Tauri 2](https://tauri.app): the same React frontend runs
inside the operating system's own webview (WKWebView on macOS, WebView2 on
Windows), so there is one codebase and the binaries stay small. Everything still
happens locally — the shell adds no network access.

### One-time setup

Install the Rust toolchain (this is the only extra prerequisite):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Platform prerequisites:

- **macOS** — Xcode Command Line Tools (`xcode-select --install`).
- **Windows** — the Microsoft C++ Build Tools (MSVC v143 + the Windows SDK) and
  the WebView2 runtime, which is already present on Windows 10 21H2 and later.

### Commands

```bash
pnpm desktop:dev      # run the app in a native window with hot reload
pnpm desktop:build    # produce a release build + installers for this platform
```

`desktop:build` writes to `src-tauri/target/release/bundle/`:

| Platform | Artefacts |
| --- | --- |
| macOS | `Reframe.app`, `Reframe_0.1.0_aarch64.dmg` |
| Windows | `Reframe_0.1.0_x64-setup.exe` (NSIS), `Reframe_0.1.0_x64_en-US.msi` |

Builds are per-architecture. On an Apple Silicon Mac, add
`--target x86_64-apple-darwin` (after `rustup target add x86_64-apple-darwin`)
for an Intel build, or `--target universal-apple-darwin` for a universal binary.

### Cross-platform builds in CI

You cannot build a macOS app on Windows or vice versa, so
[`.github/workflows/desktop.yml`](.github/workflows/desktop.yml) builds both on
their own runners. It runs on `workflow_dispatch`, and pushing a `v*` tag also
collects the installers into a **draft** GitHub release.

### Signing

Unsigned builds run, but macOS shows a Gatekeeper warning and Windows shows a
SmartScreen prompt. To sign, add the certificates as repository secrets and the
matching environment variables to the workflow — `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD` and `APPLE_TEAM_ID` for macOS notarisation, and
`WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` for Windows Authenticode.
No certificates are configured yet.

### Saving to a folder

**Save to folder…** works in both builds, through one interface in
[`src/platform/folder.ts`](src/platform/folder.ts). In a browser it uses the
File System Access API; in the desktop shell it uses Tauri's native folder
dialog and filesystem plugins, because macOS's webview does not implement that
API. Output paths are checked for traversal before anything is written, and a
failure on one file reports the real underlying reason without stopping the
rest.

## Layout

```
src-tauri/      the Tauri 2 desktop shell (Rust)
src/platform/   host-specific backends (native vs. browser folder saving)
src/core/       platform-independent logic
  types.ts      settings + job model
  pipeline.ts   geometry, trim detection, saliency  (pure, portable to Rust)
  pool.ts       worker pool / scheduler
  intake.ts     file + directory intake, output paths, collision handling
  zip.ts        store-only ZIP writer
src/workers/    the processing worker (OffscreenCanvas)
src/ui/         React interface
```

`pipeline.ts` is deliberately free of DOM and React so the same decisions can
back a Tauri/Rust implementation later; only `process.worker.ts` touches canvas.

## Known gaps vs. the specification

- Encoding uses the browser's canvas encoders, so *Optimise file size* is not
  yet a distinct step, and metadata handling is limited to what canvas does
  (it strips everything and applies EXIF orientation on decode). A WASM
  encoder layer is the next step for real optimisation and metadata options.
- TIFF/BMP/HEIC input depends on browser codec support; AVIF encoding is
  detected at runtime and reported as a clear per-image error where missing.
- Not yet built: before/after preview with interactive crop, "never crop
  detected subject", replace-originals mode, thumbnails, custom presets,
  and filename templates.
