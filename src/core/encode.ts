import type { OutputFormat } from './types'
import { mimeFor } from './pipeline'

type Format = Exclude<OutputFormat, 'keep'>

/**
 * Canvas encoding support is uneven: WKWebView (Safari, and therefore the
 * macOS desktop build) encodes neither WebP nor AVIF, and no browser encodes
 * AVIF reliably. We try the native encoder first — it is much faster where it
 * exists — and fall back to the libwebp / libavif WebAssembly builds, which
 * behave identically on every platform.
 */
export async function encodeCanvas(
  canvas: OffscreenCanvas,
  format: Format,
  /** 0..1, as accepted by convertToBlob */
  quality: number,
): Promise<Blob> {
  const mime = mimeFor(format)

  const native = await tryNative(canvas, mime, quality)
  if (native) return native

  if (format === 'webp' || format === 'avif') {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable in this browser.')
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const buffer = format === 'webp'
      ? await encodeWebp(image, quality)
      : await encodeAvif(image, quality)
    return new Blob([buffer], { type: mime })
  }

  throw new Error(`This browser cannot encode ${format.toUpperCase()} images.`)
}

/** Returns null when the browser cannot produce this type. */
async function tryNative(
  canvas: OffscreenCanvas,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  try {
    const blob = await canvas.convertToBlob({ type: mime, quality })
    // Browsers that do not support the requested type silently emit PNG.
    return blob.type === mime ? blob : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------- wasm encoders --- */

// Emscripten resolves its .wasm relative to import.meta.url, which Vite cannot
// analyse statically, so the binaries would never be emitted into the bundle.
// Importing them as URLs makes them real build assets, and locateFile points
// the runtime at the hashed, base-path-correct result.
import webpWasm from '@jsquash/webp/codec/enc/webp_enc.wasm?url'
import webpSimdWasm from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url'
import avifWasm from '@jsquash/avif/codec/enc/avif_enc.wasm?url'

/** The standard wasm-feature-detect probe for the SIMD proposal. */
const SIMD_PROBE = Uint8Array.of(
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
  10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
)

function hasSimd(): boolean {
  try {
    return WebAssembly.validate(SIMD_PROBE)
  } catch {
    return false
  }
}

interface Codec {
  encode(
    data: Uint8Array,
    width: number,
    height: number,
    options: Record<string, unknown>,
  ): Uint8Array<ArrayBuffer> | null
}

type Factory = (options: Record<string, unknown>) => Promise<Codec>

function load(factory: Factory, wasmUrl: string): Promise<Codec> {
  return factory({ noInitialRun: true, locateFile: () => wasmUrl })
}

let webpCodec: Promise<Codec> | undefined
let avifCodec: Promise<Codec> | undefined

// The multi-threaded AVIF build needs cross-origin isolation, which neither
// GitHub Pages nor the Tauri shell provides, so the single-threaded builds are
// selected explicitly rather than through @jsquash's auto-detection.
function webp(): Promise<Codec> {
  webpCodec ??= (hasSimd()
    ? import('@jsquash/webp/codec/enc/webp_enc_simd.js').then(
        m => load(m.default as unknown as Factory, webpSimdWasm))
    : import('@jsquash/webp/codec/enc/webp_enc.js').then(
        m => load(m.default as unknown as Factory, webpWasm)))
  return webpCodec
}

function avif(): Promise<Codec> {
  avifCodec ??= import('@jsquash/avif/codec/enc/avif_enc.js').then(
    m => load(m.default as unknown as Factory, avifWasm))
  return avifCodec
}

async function encodeWebp(image: ImageData, quality: number): Promise<Uint8Array<ArrayBuffer>> {
  const { defaultOptions } = await import('@jsquash/webp/meta.js')
  const codec = await webp()
  const out = codec.encode(
    new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    image.width,
    image.height,
    { ...defaultOptions, quality: qualityPct(quality) },
  )
  if (!out) throw new Error('WebP encoding failed.')
  return out
}

async function encodeAvif(image: ImageData, quality: number): Promise<Uint8Array<ArrayBuffer>> {
  const { defaultOptions } = await import('@jsquash/avif/meta.js')
  const codec = await avif()
  const out = codec.encode(
    new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    image.width,
    image.height,
    { ...defaultOptions, quality: qualityPct(quality) },
  )
  if (!out) throw new Error('AVIF encoding failed.')
  return out
}

function qualityPct(quality: number): number {
  return Math.round(Math.min(1, Math.max(0, quality)) * 100)
}
