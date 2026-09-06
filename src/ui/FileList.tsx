import { useMemo, useState } from 'react'
import type { Job } from '../core/types'
import { bytes } from '../core/format'
import Thumb from './Thumb'

interface Props {
  jobs: Job[]
  ignored: number
  thumbnails: boolean
  onThumbnails(v: boolean): void
  onDrop(dt: DataTransfer): void
  onRemove(id: string): void
  onClear(): void
}

const LABEL: Record<Job['status'], string> = {
  waiting: 'Waiting',
  processing: 'Processing',
  complete: 'Complete',
  warning: 'Warning',
  failed: 'Failed',
}

type SortKey = 'order' | 'name' | 'size'

export default function FileList({
  jobs, ignored, thumbnails, onThumbnails, onDrop, onRemove, onClear,
}: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('order')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = q ? jobs.filter((j) => j.relPath.toLowerCase().includes(q)) : [...jobs]
    if (sort === 'name') out.sort((a, b) => a.relPath.localeCompare(b.relPath))
    if (sort === 'size') out.sort((a, b) => b.inBytes - a.inBytes)
    return out
  }, [jobs, query, sort])

  const totalBytes = jobs.reduce((n, j) => n + j.inBytes, 0)

  return (
    <div
      className="panel filelist"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(e.dataTransfer) }}
    >
      <div className="filelist-head">
        <div>
          <h2>{jobs.length} {jobs.length === 1 ? 'image' : 'images'}</h2>
          <p className="muted">
            {bytes(totalBytes)}
            {ignored > 0 && ` · ${ignored} unsupported files ignored`}
          </p>
        </div>
        <div className="filelist-tools">
          <input
            type="search" placeholder="Filter…" aria-label="Filter images"
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
          <select aria-label="Sort images" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="order">Added order</option>
            <option value="name">Name</option>
            <option value="size">Largest first</option>
          </select>
          <label className="check compact">
            <input
              type="checkbox" checked={thumbnails}
              onChange={(e) => onThumbnails(e.target.checked)}
            />
            <span>Previews</span>
          </label>
          <button onClick={onClear}>Clear</button>
        </div>
      </div>

      <ul className="rows">
        {rows.map((j) => (
          <li key={j.id} className={`row status-${j.status}`}>
            <Thumb job={j} enabled={thumbnails} />
            <span className="name" title={j.relPath}>{j.relPath}</span>
            <span className="meta">
              {j.result ? (
                <>
                  {j.result.width}×{j.result.height}
                  <span className="sizes">
                    {bytes(j.inBytes)} <span aria-hidden="true">→</span>{' '}
                    <strong>{bytes(j.result.bytes)}</strong>
                  </span>
                </>
              ) : (
                bytes(j.inBytes)
              )}
            </span>
            <span className={`pill pill-${j.status}`}>
              {j.status === 'processing' && <span className="spinner" aria-hidden="true" />}
              {LABEL[j.status]}
            </span>
            <button className="link" onClick={() => onRemove(j.id)}>
              <span className="sr-only">Remove {j.name}</span>
              <span aria-hidden="true">✕</span>
            </button>
            {j.message && <span className="msg">{j.message}</span>}
          </li>
        ))}
      </ul>

      {rows.length === 0 && <p className="muted empty">No images match this filter.</p>}
      <p className="muted drop-more">Drag more images or folders here to add them.</p>
    </div>
  )
}
