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
  slider and the Maximum/High/Balanced/Small presets. **Every format works on
  every platform** — see [Encoding](#encoding).
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

- **Installable and offline.** The web app is a PWA: install it from the
  browser and it runs with no network at all. See [Offline and
  updates](#offline-and-updates).

## Encoding

Canvas encoding support is uneven across engines. WKWebView — Safari, and so
the macOS desktop build — encodes neither WebP nor AVIF, and no browser
encodes AVIF dependably. Relying on `convertToBlob` alone meant those formats
failed outright on macOS.

[`src/core/encode.ts`](src/core/encode.ts) tries the native encoder first,
because where it exists it is much faster, and verifies the result: a browser
that cannot honour the requested type silently returns PNG instead, which
counts as a failure. When native encoding is unavailable it falls back to the
libwebp and libavif builds from `@jsquash/webp` and `@jsquash/avif`, which
behave identically everywhere.

The single-threaded WebAssembly builds are selected deliberately. The
multi-threaded AVIF encoder needs cross-origin isolation, which neither GitHub
Pages nor the Tauri shell provides. WebP picks its SIMD build when the engine
supports it. The `.wasm` binaries are imported as URLs so Vite emits them as
real, base-path-correct assets, and they are only downloaded when a fallback
actually happens.

## Offline and updates

The web build is a progressive web app. The whole bundle — including the
WebAssembly codecs — is precached, so an installed Reframe converts images
with no network at all. That matches what the app already promised: nothing
was ever uploaded, and now nothing needs to be downloaded either.

Updates are silent. A new deployment is fetched in the background and takes
over the next time the app is opened, rather than being forced onto a page
that may be mid-batch; a long-lived tab re-checks hourly. Registration lives
in [`src/platform/registerSW.ts`](src/platform/registerSW.ts) and is skipped
inside the desktop shell, which ships updates through its installer instead.

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
pnpm desktop:build    # release build + installers for this platform and CPU
```

On macOS there are three explicit targets:

```bash
pnpm desktop:build:intel           # x86_64-apple-darwin
pnpm desktop:build:apple-silicon   # aarch64-apple-darwin
pnpm desktop:build:universal       # both, in one binary — what CI ships
```

Each needs its Rust target installed once:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
```

Output lands in `src-tauri/target/<target>/release/bundle/` for the three
macOS commands above, and in `src-tauri/target/release/bundle/` for a plain
`desktop:build`:

| Build | Artefacts |
| --- | --- |
| macOS universal | `Reframe.app`, `Reframe_0.1.0_universal.dmg` |
| macOS Apple Silicon | `Reframe.app`, `Reframe_0.1.0_aarch64.dmg` |
| macOS Intel | `Reframe.app`, `Reframe_0.1.0_x64.dmg` |
| Windows | `Reframe_0.1.0_x64-setup.exe` (NSIS), `Reframe_0.1.0_x64_en-US.msi` |

`desktop:build` only ever produces artefacts **for the machine it runs on**.
There is no supported way to build the Windows installers from macOS or the
macOS bundles from Windows: each needs the host's own linker, SDK and installer
tooling (MSVC and NSIS/WiX on Windows, Xcode's toolchain and `hdiutil` on
macOS). Use the CI workflow below for the platform you are not on.

A plain `desktop:build` targets only the CPU it runs on. The macOS commands
above cross the architecture boundary — but not the platform one.

### Cross-platform builds in CI

Since neither host can build for the other,
[`.github/workflows/desktop.yml`](.github/workflows/desktop.yml) builds each on
its own runner: **macOS universal** and **Windows x64**. Shipping one universal
DMG rather than separate Apple Silicon and Intel downloads means nobody has to
know which Mac they own. It runs on `workflow_dispatch`, and pushing a `v*` tag
also collects the installers into a published GitHub release as
`Reframe_<version>_macOS-Universal.dmg` and `Reframe_<version>_x64.msi`.

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
src/platform/   host-specific backends (folder saving, service worker)
src/core/       platform-independent logic
  types.ts      settings + job model
  pipeline.ts   geometry, trim detection, saliency  (pure, portable to Rust)
  pool.ts       worker pool / scheduler
  intake.ts     file + directory intake, output paths, collision handling
  zip.ts        store-only ZIP writer
  encode.ts     native canvas encoder + WebAssembly WebP/AVIF fallback
src/workers/    the processing worker (OffscreenCanvas)
src/ui/         React interface
```

`pipeline.ts` is deliberately free of DOM and React so the same decisions can
back a Tauri/Rust implementation later; only `process.worker.ts` touches canvas.

## Known gaps vs. the specification

- *Optimise file size* is not yet a distinct step. WebP and AVIF now go
  through WebAssembly encoders where the canvas cannot help, but that layer is
  used only as a fallback; driving it directly would open up real
  quality/size search and metadata options.
- Metadata handling is limited to what canvas does: it strips everything and
  applies EXIF orientation on decode.
- *Decoding* still depends on the engine, so TIFF/BMP/HEIC input varies by
  platform and is reported as a clear per-image error where unsupported.
- Not yet built: before/after preview with interactive crop, "never crop
  detected subject", replace-originals mode, thumbnails, custom presets,
  and filename templates.
