import { useCallback, useMemo, useState } from 'react'
import type { Settings } from '../core/types'
import { BUILT_IN, newId, uniqueName, type ParsedPreset, type Preset } from '../core/presets'

const KEY = 'reframe.presets'

function load(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Preset[]
    return Array.isArray(list) ? list.filter((p) => p && !p.builtIn) : []
  } catch {
    return []
  }
}

export type ImportChoice = 'overwrite' | 'rename'

export function usePresets() {
  const [custom, setCustom] = useState<Preset[]>(load)

  /**
   * All writes go through a functional update so several changes made in one
   * pass (an import resolving many conflicts) each see the previous result
   * rather than a stale snapshot.
   */
  const persist = useCallback((fn: (prev: Preset[]) => Preset[]) => {
    setCustom((prev) => {
      const next = fn(prev)
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }, [])

  const all = useMemo(() => [...BUILT_IN, ...custom], [custom])
  const names = useMemo(() => all.map((p) => p.name), [all])

  const create = useCallback((name: string, settings: Settings) => {
    const preset: Preset = { id: newId(), name, settings: structuredClone(settings), builtIn: false }
    persist((prev) => [...prev, preset])
    return preset
  }, [persist])

  const update = useCallback((id: string, patch: Partial<Pick<Preset, 'name' | 'settings'>>) => {
    persist((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [persist])

  const remove = useCallback((id: string) => {
    persist((prev) => prev.filter((p) => p.id !== id))
  }, [persist])

  /**
   * Apply a resolved import. Built-in names can never be overwritten, so an
   * "overwrite" that lands on one falls back to a numbered copy.
   */
  const importPresets = useCallback((items: ParsedPreset[], choice: ImportChoice) => {
    persist((prev) => {
      const next = [...prev]
      for (const item of items) {
        const taken = [...BUILT_IN, ...next].map((p) => p.name)
        const existing = next.find((p) => p.name.toLowerCase() === item.name.toLowerCase())
        const isBuiltIn = BUILT_IN.some((p) => p.name.toLowerCase() === item.name.toLowerCase())

        if (choice === 'overwrite' && existing) {
          next[next.indexOf(existing)] = { ...existing, settings: item.settings }
        } else if (choice === 'overwrite' && !existing && !isBuiltIn) {
          next.push({ id: newId(), name: item.name, settings: item.settings, builtIn: false })
        } else {
          next.push({
            id: newId(),
            name: uniqueName(item.name, taken),
            settings: item.settings,
            builtIn: false,
          })
        }
      }
      return next
    })
    return items.length
  }, [persist])

  return { custom, all, names, create, update, remove, importPresets }
}
