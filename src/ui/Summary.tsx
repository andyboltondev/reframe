import { useState } from 'react'
import type { Job } from '../core/types'
import { bytes, duration } from '../core/format'

interface Props {
  jobs: Job[]
  elapsed: number
  canWriteFolder: boolean
  onExport(): void
  onSaveToFolder(): void
  onRestart(): void
  save: { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }
}

export default function Summary({
  jobs, elapsed, canWriteFolder, onExport, onSaveToFolder, onRestart, save,
}: Props) {
  const [showErrors, setShowErrors] = useState(false)
  const failed = jobs.filter((j) => j.status === 'failed')
  const ok = jobs.filter((j) => j.result)
  const inBytes = ok.reduce((n, j) => n + j.inBytes, 0)
  const outBytes = ok.reduce((n, j) => n + j.result!.bytes, 0)
  const saved = inBytes - outBytes
  const pct = inBytes > 0 ? (saved / inBytes) * 100 : 0

  return (
    <div className="panel summary">
      <div className="summary-head">
        <div>
          <h2>Conversion complete</h2>
          <p className="muted">
            {jobs.length} processed · {ok.length} successful
            {failed.length > 0 && ` · ${failed.length} failed`} · {duration(elapsed)}
          </p>
        </div>
        <div className="summary-actions">
          <button onClick={onRestart}>Start another batch</button>
          {canWriteFolder && (
            <button onClick={onSaveToFolder} disabled={save.kind === 'busy' || !ok.length}>
              Save to folder…
            </button>
          )}
          <button className="primary" onClick={onExport} disabled={!ok.length}>
            {ok.length > 1 ? 'Export as ZIP' : 'Export image'}
          </button>
        </div>
      </div>

      {save.message && (
        <p className={`save-note save-${save.kind}`} role="status">
          {save.kind === 'busy' && <span className="spinner" aria-hidden="true" />}
          {save.message}
        </p>
      )}

      <p className="muted export-hint">
        {canWriteFolder
          ? 'Save to folder writes straight to a folder you choose. Export as ZIP hands the file to your browser. Nothing is uploaded.'
          : 'Export hands the file to your browser. Nothing is uploaded.'}
      </p>

      <dl className="stats">
        <div><dt>Original size</dt><dd>{bytes(inBytes)}</dd></div>
        <div><dt>New size</dt><dd>{bytes(outBytes)}</dd></div>
        <div className="stat-good">
          <dt>Saved</dt>
          <dd>{bytes(Math.max(0, saved))}</dd>
        </div>
        <div className="stat-good">
          <dt>Reduction</dt>
          <dd>{pct > 0 ? `${pct.toFixed(1)}%` : '—'}</dd>
        </div>
      </dl>

      {saved > 0 && (
        <div className="savings" aria-hidden="true">
          <div className="savings-fill" style={{ width: `${Math.min(100, 100 - pct)}%` }} />
        </div>
      )}

      {failed.length > 0 && (
        <div className="errors">
          <button className="link" onClick={() => setShowErrors((v) => !v)} aria-expanded={showErrors}>
            {showErrors ? 'Hide' : 'View'} {failed.length} failed{' '}
            {failed.length === 1 ? 'image' : 'images'}
          </button>
          {showErrors && (
            <ul>
              {failed.map((j) => (
                <li key={j.id}>
                  <strong>{j.relPath}</strong>
                  <span>{j.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
