# Reframe — proof of concept

**Convert. Resize. Optimise.** A batch image converter/resizer that does all
processing locally. This repo currently contains the **web** proof of concept
from the design specification.

```bash
pnpm install
pnpm dev      # http://localhost:5199
pnpm build
```

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

## Layout

```
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
  filename templates, and the Tauri desktop shell.
