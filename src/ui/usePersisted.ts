import { useEffect, useState } from 'react'

/** Settings persistence (spec §25). Image contents are never stored. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...initial, ...JSON.parse(raw) } : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
  }, [key, value])
  return [value, setValue]
}
