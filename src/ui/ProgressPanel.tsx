import { duration } from '../core/format'

interface Props {
  done: number
  total: number
  active: number
  failed: number
  elapsed: number
  paused: boolean
  onPause(): void
  onCancel(): void
}

export default function ProgressPanel({
  done, total, active, failed, elapsed, paused, onPause, onCancel,
}: Props) {
  const pct = total ? Math.round((done / total) * 100) : 0
  const remaining = Math.max(0, total - done)
  const eta = done > 0 && !paused ? (elapsed / done) * remaining : null

  return (
    <div className="panel progress-panel">
      <div className="progress-head">
        <div>
          <h2>{paused ? 'Paused' : 'Converting images'}</h2>
          <p className="muted">
            {active} processing · {remaining} remaining
            {failed > 0 && ` · ${failed} failed`}
          </p>
        </div>
        <div className="progress-count">
          <strong>{done}</strong>
          <span> / {total}</span>
        </div>
      </div>

      <div
        className="bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Conversion progress"
      >
        <div className={`bar-fill${paused ? ' paused' : ''}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="progress-foot">
        <span className="muted">
          {pct}% · Elapsed {duration(elapsed)}
          {eta !== null && eta > 1000 && ` · about ${duration(eta)} left`}
        </span>
        <span className="progress-actions">
          <button onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button>
          <button onClick={onCancel}>Cancel</button>
        </span>
      </div>
    </div>
  )
}
