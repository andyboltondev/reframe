import type { Settings, OutputFormat } from './types'

export interface Rect { x: number; y: number; w: number; h: number }

const MIME: Record<Exclude<OutputFormat, 'keep'>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
}

const EXT: Record<Exclude<OutputFormat, 'keep'>, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
}

export function formatFromMime(mime: string): Exclude<OutputFormat, 'keep'> {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('avif')) return 'avif'
  return 'jpeg'
}

export function supportsAlpha(f: Exclude<OutputFormat, 'keep'>): boolean {
  return f === 'png' || f === 'webp' || f === 'avif'
}

export function mimeFor(f: Exclude<OutputFormat, 'keep'>): string {
  return MIME[f]
}

export function extFor(f: Exclude<OutputFormat, 'keep'>): string {
  return EXT[f]
}

/* ---------------------------------------------------------------- trim --- */

/**
 * Find the bounding box of non-background pixels. Background is either the
 * transparent/white target, or — in auto mode — sampled from the corners.
 */
export function trimBox(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  mode: Settings['trim']['mode'],
  tolerancePct: number,
): Rect {
  const tol = (tolerancePct / 100) * 255
  let bg: [number, number, number, number]

  if (mode === 'transparent') bg = [0, 0, 0, 0]
  else if (mode === 'white') bg = [255, 255, 255, 255]
  else {
    // auto: average the four corners
    const corners = [
      0,
      (w - 1) * 4,
      (h - 1) * w * 4,
      ((h - 1) * w + (w - 1)) * 4,
    ]
    const acc = [0, 0, 0, 0]
    for (const o of corners) for (let c = 0; c < 4; c++) acc[c] += data[o + c]
    bg = [acc[0] / 4, acc[1] / 4, acc[2] / 4, acc[3] / 4]
  }

  const isBg = (o: number) => {
    const a = data[o + 3]
    // fully transparent pixels always count as empty space
    if (a <= tol && bg[3] <= tol) return true
    if (Math.abs(a - bg[3]) > tol) return false
    if (a === 0) return true
    return (
      Math.abs(data[o] - bg[0]) <= tol &&
      Math.abs(data[o + 1] - bg[1]) <= tol &&
      Math.abs(data[o + 2] - bg[2]) <= tol
    )
  }

  let top = 0, bottom = h - 1, left = 0, right = w - 1
  scanTop: for (; top < h; top++)
    for (let x = 0; x < w; x++) if (!isBg((top * w + x) * 4)) break scanTop
  if (top === h) return { x: 0, y: 0, w, h } // fully empty: leave untouched
  scanBottom: for (; bottom > top; bottom--)
    for (let x = 0; x < w; x++) if (!isBg((bottom * w + x) * 4)) break scanBottom
  scanLeft: for (; left < w; left++)
    for (let y = top; y <= bottom; y++) if (!isBg((y * w + left) * 4)) break scanLeft
  scanRight: for (; right > left; right--)
    for (let y = top; y <= bottom; y++) if (!isBg((y * w + right) * 4)) break scanRight

  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
}

/* ------------------------------------------------------------ geometry --- */

export interface TargetSize { w: number; h: number }

/** Resolve the requested output box from the resize settings. */
export function targetSize(srcW: number, srcH: number, s: Settings): TargetSize {
  const r = s.resize
  if (!r.enabled || r.mode === 'none') return { w: srcW, h: srcH }

  let w: number, h: number
  switch (r.mode) {
    case 'wh':
      w = r.width; h = r.height; break
    case 'longest': {
      const scale = r.longest / Math.max(srcW, srcH)
      w = Math.round(srcW * scale); h = Math.round(srcH * scale); break
    }
    case 'width':
      w = r.width; h = Math.round((srcH / srcW) * r.width); break
    case 'height':
      h = r.height; w = Math.round((srcW / srcH) * r.height); break
    case 'percent':
      w = Math.round(srcW * (r.percent / 100)); h = Math.round(srcH * (r.percent / 100)); break
    default:
      w = srcW; h = srcH
  }

  // Aspect-preserving modes shrink the whole box when enlargement is off.
  // Fixed-canvas modes (width & height) keep their canvas; the enlargement
  // guard is applied to the image scale in placement() instead.
  if (!r.allowEnlarge && r.mode !== 'wh') {
    const shrink = Math.min(1, srcW / w, srcH / h)
    if (shrink < 1) { w = Math.round(w * shrink); h = Math.round(h * shrink) }
  }
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

/** Where the source rect is sampled from, and where it lands on the canvas. */
export interface Placement {
  src: Rect
  dest: Rect
  canvas: TargetSize
}

export function placement(
  srcW: number,
  srcH: number,
  target: TargetSize,
  fit: Settings['fit'],
  anchor: { x: number; y: number },
  freeAspect: boolean,
  allowEnlarge = true,
): Placement {
  const full: Rect = { x: 0, y: 0, w: srcW, h: srcH }

  // Single-dimension / percent modes already carry the right aspect ratio.
  if (freeAspect || fit === 'stretch') {
    return { src: full, dest: { x: 0, y: 0, ...target }, canvas: target }
  }

  const cap = (v: number) => (allowEnlarge ? v : Math.min(1, v))
  const scaleContain = cap(Math.min(target.w / srcW, target.h / srcH))

  if (fit === 'contain') {
    const w = Math.max(1, Math.round(srcW * scaleContain))
    const h = Math.max(1, Math.round(srcH * scaleContain))
    return { src: full, dest: { x: 0, y: 0, w, h }, canvas: { w, h } }
  }

  if (fit === 'pad') {
    const w = Math.max(1, Math.round(srcW * scaleContain))
    const h = Math.max(1, Math.round(srcH * scaleContain))
    return {
      src: full,
      dest: {
        x: Math.round((target.w - w) / 2),
        y: Math.round((target.h - h) / 2),
        w,
        h,
      },
      canvas: target,
    }
  }

  // cover: crop the source to the target aspect ratio, positioned by anchor
  const scale = cap(Math.max(target.w / srcW, target.h / srcH))
  const cropW = Math.min(srcW, Math.round(target.w / scale))
  const cropH = Math.min(srcH, Math.round(target.h / scale))
  const x = clamp(Math.round(anchor.x * srcW - cropW / 2), 0, srcW - cropW)
  const y = clamp(Math.round(anchor.y * srcH - cropH / 2), 0, srcH - cropH)
  // When enlargement is off and the source is smaller than the target, the
  // crop cannot fill the canvas — centre it and let the background show.
  const drawW = Math.round(cropW * scale)
  const drawH = Math.round(cropH * scale)
  return {
    src: { x, y, w: cropW, h: cropH },
    dest: {
      x: Math.round((target.w - drawW) / 2),
      y: Math.round((target.h - drawH) / 2),
      w: drawW,
      h: drawH,
    },
    canvas: target,
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

/* --------------------------------------------------------- smart focus --- */

/**
 * Cheap saliency: local contrast on a downscaled copy, weighted slightly
 * towards the centre. Returns a focal point in 0..1 coordinates.
 *
 * This is the fallback tier of the spec's smart crop; face/subject detection
 * would plug in ahead of it.
 */
export function focalPoint(data: Uint8ClampedArray, w: number, h: number) {
  let sum = 0, sx = 0, sy = 0
  const lum = new Float32Array(w * h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    lum[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
    // transparent regions carry no subject
    if (data[p + 3] < 16) lum[i] = -1
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (lum[i] < 0) continue
      const gx = Math.abs(lum[i - 1] - lum[i + 1])
      const gy = Math.abs(lum[i - w] - lum[i + w])
      const cx = (x / w - 0.5) * 2
      const cy = (y / h - 0.5) * 2
      const centre = 1 - 0.35 * Math.min(1, Math.hypot(cx, cy))
      const e = (gx + gy) * centre
      sum += e; sx += e * x; sy += e * y
    }
  }
  if (sum < 1e-6) return { x: 0.5, y: 0.5 }
  return { x: clamp(sx / sum / w, 0, 1), y: clamp(sy / sum / h, 0, 1) }
}

export function anchorPoint(anchor: Settings['anchor']): { x: number; y: number } | null {
  switch (anchor) {
    case 'center': return { x: 0.5, y: 0.5 }
    case 'top': return { x: 0.5, y: 0 }
    case 'bottom': return { x: 0.5, y: 1 }
    case 'left': return { x: 0, y: 0.5 }
    case 'right': return { x: 1, y: 0.5 }
    default: return null // smart — computed from pixels
  }
}
