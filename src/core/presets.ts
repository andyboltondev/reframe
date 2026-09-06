import { defaultSettings, type Settings } from './types'

export interface Preset {
  id: string
  name: string
  settings: Settings
  /** Built-in presets ship with Reframe and cannot be edited or deleted. */
  builtIn: boolean
}

const base = defaultSettings

export const BUILT_IN: Preset[] = [
  {
    id: 'builtin:web-optimised',
    name: 'Web Optimised',
    builtIn: true,
    settings: {
      ...base,
      format: 'webp', quality: 82, optimise: true,
      resize: { ...base.resize, enabled: true, mode: 'longest', longest: 2000 },
    },
  },
  {
    id: 'builtin:product-square',
    name: 'Product Square',
    builtIn: true,
    settings: {
      ...base,
      format: 'webp', quality: 85,
      resize: { ...base.resize, enabled: true, mode: 'wh', width: 1200, height: 1200 },
      fit: 'pad', anchor: 'smart', padColor: '#ffffff', subjectPadding: 10,
      trim: { enabled: true, mode: 'auto', tolerance: 5 },
    },
  },
  {
    id: 'builtin:social-square',
    name: 'Social Square',
    builtIn: true,
    settings: {
      ...base,
      format: 'jpeg', quality: 88,
      resize: { ...base.resize, enabled: true, mode: 'wh', width: 1080, height: 1080 },
      fit: 'cover', anchor: 'smart',
    },
  },
  {
    id: 'builtin:keep-dimensions',
    name: 'Keep Dimensions',
    builtIn: true,
    settings: {
      ...base,
      format: 'webp', quality: 85,
      resize: { ...base.resize, enabled: false },
    },
  },
]

/* ------------------------------------------------------------ validation --- */

const FORMATS = ['keep', 'jpeg', 'png', 'webp', 'avif']
const MODES = ['none', 'wh', 'longest', 'width', 'height', 'percent']
const FITS = ['contain', 'cover', 'stretch', 'pad']
const ANCHORS = ['smart', 'center', 'top', 'bottom', 'left', 'right', 'custom']
const TRIMS = ['transparent', 'white', 'auto']

const pick = <T extends string>(v: unknown, allowed: string[], fallback: T): T =>
  typeof v === 'string' && allowed.includes(v) ? (v as T) : fallback

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

/**
 * Imported presets are untrusted JSON, so every field is validated back into
 * range rather than spread straight onto the live settings.
 */
export function coerceSettings(raw: unknown): Settings {
  const o = (raw ?? {}) as Record<string, unknown>
  const r = (o.resize ?? {}) as Record<string, unknown>
  const t = (o.trim ?? {}) as Record<string, unknown>
  const d = defaultSettings

  const colour = typeof o.padColor === 'string' &&
    (o.padColor === 'transparent' || /^#[0-9a-f]{6}$/i.test(o.padColor))
    ? o.padColor
    : d.padColor

  return {
    format: pick(o.format, FORMATS, d.format),
    quality: num(o.quality, 1, 100, d.quality),
    optimise: bool(o.optimise, d.optimise),
    resize: {
      enabled: bool(r.enabled, d.resize.enabled),
      mode: pick(r.mode, MODES, d.resize.mode),
      width: num(r.width, 1, 100000, d.resize.width),
      height: num(r.height, 1, 100000, d.resize.height),
      longest: num(r.longest, 1, 100000, d.resize.longest),
      percent: num(r.percent, 1, 1000, d.resize.percent),
      allowEnlarge: bool(r.allowEnlarge, d.resize.allowEnlarge),
    },
    fit: pick(o.fit, FITS, d.fit),
    anchor: pick(o.anchor, ANCHORS, d.anchor),
    subjectPadding: num(o.subjectPadding, 0, 45, d.subjectPadding),
    padColor: colour,
    trim: {
      enabled: bool(t.enabled, d.trim.enabled),
      mode: pick(t.mode, TRIMS, d.trim.mode),
      tolerance: num(t.tolerance, 0, 100, d.trim.tolerance),
    },
  }
}

/* --------------------------------------------------------- import/export --- */

export interface PresetFile {
  app: 'reframe'
  kind: 'presets'
  version: 1
  presets: { name: string; settings: Settings }[]
}

export function exportPresets(presets: Preset[]): string {
  const file: PresetFile = {
    app: 'reframe',
    kind: 'presets',
    version: 1,
    presets: presets.map((p) => ({ name: p.name, settings: p.settings })),
  }
  return JSON.stringify(file, null, 2)
}

export interface ParsedPreset { name: string; settings: Settings }

/** Parse a preset file, throwing a readable message when it is not one. */
export function parsePresetFile(text: string): ParsedPreset[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  const o = data as Partial<PresetFile>
  const list = Array.isArray(o?.presets) ? o.presets : null
  if (!list) throw new Error('That file does not contain any Reframe presets.')

  const out = list
    .filter((p): p is { name: string; settings: Settings } => !!p && typeof p.name === 'string')
    .map((p) => ({ name: p.name.trim().slice(0, 60) || 'Untitled preset', settings: coerceSettings(p.settings) }))

  if (!out.length) throw new Error('That file does not contain any Reframe presets.')
  return out
}

/** "Web Optimised" → "Web Optimised 2" when the name is already taken. */
export function uniqueName(name: string, taken: string[]): string {
  const lower = taken.map((t) => t.toLowerCase())
  if (!lower.includes(name.toLowerCase())) return name
  const stem = name.replace(/\s+\d+$/, '')
  let n = 2
  while (lower.includes(`${stem} ${n}`.toLowerCase())) n++
  return `${stem} ${n}`
}

export function newId(): string {
  return `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
