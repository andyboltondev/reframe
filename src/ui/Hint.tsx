import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'

const WIDTH = 240
const GAP = 8
const MARGIN = 8

/**
 * A small "?" affordance. The text is exposed to assistive technology through
 * aria-describedby, and shown on hover or keyboard focus.
 *
 * The tooltip is positioned fixed and clamped to the viewport: the settings
 * pane scrolls, so an absolutely positioned bubble would be clipped by it.
 */
export default function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const id = useId()

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect()
    const height = tip.current?.offsetHeight ?? 60
    if (!b) return
    const above = b.top - GAP - height
    setPos({
      top: above >= MARGIN ? above : b.bottom + GAP,
      left: Math.min(
        Math.max(MARGIN, b.left + b.width / 2 - WIDTH / 2),
        window.innerWidth - WIDTH - MARGIN,
      ),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  return (
    <span className="hint-wrap">
      <button
        ref={btn}
        type="button"
        className="hint-btn"
        aria-label="More information"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}
      >
        ?
      </button>
      {open && (
        <span
          ref={tip}
          role="tooltip"
          id={id}
          className="tooltip"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
