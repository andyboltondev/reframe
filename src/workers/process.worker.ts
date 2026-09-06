/// <reference lib="webworker" />
import {
  anchorPoint, extFor, focalPoint, formatFromMime, placement,
  supportsAlpha, targetSize, trimBox,
} from '../core/pipeline'
import { encodeCanvas } from '../core/encode'
import type { WorkerRequest, WorkerResponse } from '../core/types'

/** Longest side of the scratch buffer used for trim / saliency analysis. */
const ANALYSIS_SIZE = 160

function ctxOf(w: number, h: number) {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: false })
  if (!ctx) throw new Error('Canvas is unavailable in this browser.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { c, ctx }
}

function analyse(bitmap: ImageBitmap) {
  const scale = Math.min(1, ANALYSIS_SIZE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const { ctx } = ctxOf(w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h).data, w, h }
}

async function run(req: WorkerRequest): Promise<WorkerResponse> {
  const { id, file, settings: s } = req
  let warning: string | undefined

  // --- decode (browser applies EXIF orientation for us) -------------------
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return { id, ok: false, error: `Could not decode this ${(file.type || 'image').replace('image/', '').toUpperCase()} file. The format may not be supported by this browser.` }
  }

  const srcW = bitmap.width
  const srcH = bitmap.height

  try {
    // --- trim ------------------------------------------------------------
    let src = { x: 0, y: 0, w: srcW, h: srcH }
    if (s.trim.enabled) {
      const a = analyse(bitmap)
      const box = trimBox(a.data, a.w, a.h, s.trim.mode, s.trim.tolerance)
      const kx = srcW / a.w
      const ky = srcH / a.h
      src = {
        x: Math.floor(box.x * kx),
        y: Math.floor(box.y * ky),
        w: Math.max(1, Math.ceil(box.w * kx)),
        h: Math.max(1, Math.ceil(box.h * ky)),
      }
      if (src.w !== srcW || src.h !== srcH) {
        const cropped = await createImageBitmap(bitmap, src.x, src.y, src.w, src.h)
        bitmap.close()
        bitmap = cropped
      }
    }

    const w0 = bitmap.width
    const h0 = bitmap.height

    // --- geometry --------------------------------------------------------
    const target = targetSize(w0, h0, s)
    const freeAspect =
      !s.resize.enabled ||
      s.resize.mode === 'none' ||
      s.resize.mode === 'longest' ||
      s.resize.mode === 'width' ||
      s.resize.mode === 'height' ||
      s.resize.mode === 'percent'

    let anchor = anchorPoint(s.anchor)
    if (!anchor) {
      if (!freeAspect && s.fit === 'cover') {
        const a = analyse(bitmap)
        anchor = focalPoint(a.data, a.w, a.h)
      } else {
        anchor = { x: 0.5, y: 0.5 }
      }
    }

    let p = placement(w0, h0, target, s.fit, anchor, freeAspect, s.resize.allowEnlarge)

    // Subject padding: keep the image clear of the canvas edges (spec §14).
    if (s.fit === 'pad' && s.subjectPadding > 0 && !freeAspect) {
      const k = 1 - Math.min(45, s.subjectPadding) / 50
      const w = Math.max(1, Math.round(p.dest.w * k))
      const h = Math.max(1, Math.round(p.dest.h * k))
      p = {
        ...p,
        dest: {
          x: Math.round((p.canvas.w - w) / 2),
          y: Math.round((p.canvas.h - h) / 2),
          w, h,
        },
      }
    }

    // --- draw ------------------------------------------------------------
    const outFormat = s.format === 'keep' ? formatFromMime(file.type) : s.format
    const alpha = supportsAlpha(outFormat)
    const transparentPad = s.padColor === 'transparent'

    const { c, ctx } = ctxOf(p.canvas.w, p.canvas.h)
    const fillsCanvas =
      p.dest.x === 0 && p.dest.y === 0 &&
      p.dest.w === p.canvas.w && p.dest.h === p.canvas.h
    const needsBackground = !alpha || (!fillsCanvas && !transparentPad)
    if (needsBackground) {
      ctx.fillStyle = transparentPad && !alpha ? '#ffffff' : s.padColor
      ctx.fillRect(0, 0, p.canvas.w, p.canvas.h)
    }
    if (transparentPad && !alpha && !fillsCanvas) {
      warning = 'Transparent padding is not supported by this format; white was used.'
    }
    ctx.drawImage(
      bitmap,
      p.src.x, p.src.y, p.src.w, p.src.h,
      p.dest.x, p.dest.y, p.dest.w, p.dest.h,
    )
    bitmap.close()

    // --- encode ----------------------------------------------------------
    const quality = s.quality / 100
    let blob: Blob
    try {
      blob = await encodeCanvas(c, outFormat, quality)
    } catch (e) {
      return {
        id,
        ok: false,
        error: e instanceof Error && e.message
          ? e.message
          : `Could not encode this image as ${outFormat.toUpperCase()}.`,
      }
    }

    return {
      id, ok: true, blob, ext: extFor(outFormat),
      width: p.canvas.w, height: p.canvas.h, srcW, srcH, warning,
    }
  } catch (e) {
    return { id, ok: false, error: e instanceof Error ? e.message : 'Unexpected processing error.' }
  }
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const res = await run(ev.data)
  ;(self as unknown as Worker).postMessage(res)
}
