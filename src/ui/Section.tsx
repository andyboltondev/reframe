import type { ReactNode } from 'react'
import Hint from './Hint'

interface Props {
  id: string
  title: string
  open: boolean
  onToggle(id: string): void
  /** Short recap shown on the header when the section is collapsed. */
  summary?: string
  hint?: string
  children: ReactNode
}

export default function Section({ id, title, open, onToggle, summary, hint, children }: Props) {
  return (
    <section className={`acc${open ? ' open' : ''}`}>
      <h2>
        <button
          className="acc-head"
          aria-expanded={open}
          aria-controls={`panel-${id}`}
          onClick={() => onToggle(id)}
        >
          <span className="chev" aria-hidden="true">▸</span>
          <span className="acc-title">{title}</span>
          {!open && summary && <span className="acc-summary">{summary}</span>}
        </button>
      </h2>
      {hint && <span className="acc-hint">{open && <Hint text={hint} />}</span>}
      <div className="acc-body" id={`panel-${id}`} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
