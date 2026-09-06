import type { Settings } from '../core/types'

const FORMAT_LABEL: Record<Settings['format'], string> = {
  keep: 'Keep original', jpeg: 'JPEG', png: 'PNG', webp: 'WebP', avif: 'AVIF',
}

const FIT_LABEL: Record<Settings['fit'], string> = {
  contain: 'Contain', cover: 'Crop', pad: 'Pad', stretch: 'Stretch',
}

/** Short, human recap of what Convert will do — shown in the status bar. */
export function describeSettings(s: Settings): string[] {
  const out: string[] = [FORMAT_LABEL[s.format]]

  if (s.format !== 'png') out.push(`Quality ${s.quality}`)

  const r = s.resize
  if (!r.enabled || r.mode === 'none') {
    out.push('Original size')
  } else if (r.mode === 'longest') {
    out.push(`Longest side ${r.longest}px`)
  } else if (r.mode === 'wh') {
    out.push(`${r.width}×${r.height}px · ${FIT_LABEL[s.fit]}${
      s.fit === 'cover' && s.anchor === 'smart' ? ' (smart)' : ''
    }`)
  } else if (r.mode === 'width') {
    out.push(`Width ${r.width}px`)
  } else if (r.mode === 'height') {
    out.push(`Height ${r.height}px`)
  } else {
    out.push(`Scale ${r.percent}%`)
  }

  if (r.enabled && r.allowEnlarge) out.push('Enlarge allowed')
  if (s.trim.enabled) out.push(`Trim ${s.trim.mode}`)
  if (s.optimise) out.push('Optimised')

  return out
}
