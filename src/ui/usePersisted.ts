import { useEffect, useState } from 'react'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Settings persistence (spec §25). Image contents are never stored. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return initial
      const parsed = JSON.parse(raw)
      // Merge stored keys onto the defaults so newly-added fields still get a
      // value — but only when both sides are plain objects. For primitives
      // the stored value replaces the default outright; spreading them would
      // corrupt the result (`{...320}` is `{}`).
      if (isPlainObject(initial)) {
        return isPlainObject(parsed) ? { ...initial, ...parsed } : initial
      }
      // A stored value whose shape no longer matches the default (e.g. left
      // over from an earlier bug) is discarded rather than handed back.
      return typeof parsed === typeof initial && !isPlainObject(parsed)
        ? (parsed as T)
        : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
  }, [key, value])
  return [value, setValue]
}
