import { useEffect, useId, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onSelect(): void
  disabled?: boolean
  /** Why the item is unavailable, or what it does. */
  hint?: string
  danger?: boolean
  separated?: boolean
}

interface Props {
  label: string
  items: MenuItem[]
  disabled?: boolean
}

/** A small popup menu: closes on Escape, outside click, or selection. */
export default function Menu({ label, items, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector('button')?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const move = (from: HTMLElement, dir: 1 | -1) => {
    const all = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const i = all.indexOf(from)
    all[(i + dir + all.length) % all.length]?.focus()
  }

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        className="menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="menu" role="menu" id={id}>
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              title={item.hint}
              className={[item.danger ? 'danger-item' : '', item.separated ? 'separated' : ''].join(' ').trim() || undefined}
              onClick={() => { setOpen(false); item.onSelect() }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); move(e.currentTarget, 1) }
                if (e.key === 'ArrowUp') { e.preventDefault(); move(e.currentTarget, -1) }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
