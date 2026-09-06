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

### Setting up the toolchain

Building the web app needs only Node and pnpm. The desktop shell additionally
needs Rust and your platform's native compiler and linker — Tauri compiles a
real binary rather than packaging a browser. Both sets of steps below are
one-time.

#### macOS

1. **Xcode Command Line Tools** — provides `clang`, the linker and the macOS
   SDK. Skip if you already have full Xcode installed.

   ```bash
   xcode-select --install
   ```

2. **Rust**, via rustup. Accept the default (stable) toolchain.

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

   > **If `cargo` is not found in a new terminal**, rustup added its `PATH` line
   > to `~/.profile`, which zsh — the default macOS shell — never reads. Either
   > run `source ~/.cargo/env` for the current shell, or add that same line to
   > `~/.zshenv` to make it stick.

3. **Verify** before building anything:

   ```bash
   cargo --version && xcodebuild -version
   ```

Nothing else is required: the webview (WKWebView) and the DMG tooling
(`hdiutil`) both ship with macOS.

#### Windows

1. **Microsoft C++ Build Tools** — Tauri links with MSVC, so this is required
   even though you write no C++. Install the *Desktop development with C++*
   workload, which includes the MSVC v143 toolset and the Windows SDK. Either
   run the standalone
   [Build Tools installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/),
   or install Visual Studio with that workload ticked, or use winget:

   ```powershell
   winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```

2. **Rust**, via [rustup-init.exe](https://rustup.rs) or winget. Choose the
   default `x86_64-pc-windows-msvc` toolchain — **not** the GNU one, which
   Tauri does not support.

   ```powershell
   winget install --id Rustlang.Rustup
   ```

   Close and reopen your terminal afterwards so the new `PATH` is picked up.

3. **WebView2 runtime** — already present on Windows 10 21H2 and later, and on
   all of Windows 11. On anything older, install the
   [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/).

4. **Verify** in a fresh terminal:

   ```powershell
   cargo --version
   rustc -vV        # the "host:" line should end in -msvc
   ```

The NSIS and WiX toolchains that produce the installers are downloaded by Tauri
on the first `desktop:build`, so there is nothing to install for those.

#### Both platforms

Install the JavaScript dependencies once, from the repository root:

```bash
pnpm install
```

The first `pnpm desktop:build` compiles the whole Rust dependency tree and takes
a few minutes; later builds reuse `src-tauri/target` and take seconds.

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

`desktop:build` only ever produces artefacts **for the machine it runs on**.
There is no supported way to build the Windows installers from macOS or the
macOS bundles from Windows: each needs the host's own linker, SDK and installer
tooling (MSVC and NSIS/WiX on Windows, Xcode's toolchain and `hdiutil` on
macOS). Use the CI workflow below for the platform you are not on.

Builds are also per-architecture. On an Apple Silicon Mac, add
`--target x86_64-apple-darwin` (after `rustup target add x86_64-apple-darwin`)
for an Intel build, or `--target universal-apple-darwin` for a universal binary.

### Cross-platform builds in CI

Since neither host can build for the other,
[`.github/workflows/desktop.yml`](.github/workflows/desktop.yml) builds each on
its own runner — macOS arm64, macOS x64 and Windows x64. It runs on `workflow_dispatch`, and pushing a `v*` tag also
collects the installers into a published GitHub release.

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
