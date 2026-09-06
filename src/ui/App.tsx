import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultSettings, type Job, type Settings, type SourceFile } from '../core/types'
import { fromDrop, fromFileList, outputPath } from '../core/intake'
import { WorkerPool, defaultConcurrency } from '../core/pool'
import { buildZip } from '../core/zip'
import { bytes, duration } from '../core/format'
import { usePersisted } from './usePersisted'
import SettingsPanel from './SettingsPanel'
import FileList from './FileList'
import Dropzone from './Dropzone'
import ProgressPanel from './ProgressPanel'
import Summary from './Summary'
import ThemeToggle, { type Theme } from './ThemeToggle'
import { describeSettings } from './describe'
import { describeWriteError, folderSaveAvailable, pickFolder } from '../platform/folder'

type Phase = 'idle' | 'running' | 'paused' | 'done'

interface Prefs {
  theme: Theme
  recursive: boolean
  preservePaths: boolean
  thumbnails: boolean
}

export default function App() {
  const [settings, setSettings] = usePersisted<Settings>('reframe.settings', defaultSettings)
  const [prefs, setPrefs] = usePersisted<Prefs>('reframe.prefs', {
    theme: 'system', recursive: true, preservePaths: true, thumbnails: true,
  })

  const [dragging, setDragging] = useState(false)

  const [sources, setSources] = useState<SourceFile[]>([])
  const [jobs, setJobs] = useState<Record<string, Job>>({})
  const [ignored, setIgnored] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)

  const [ranWith, setRanWith] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({ kind: 'idle' })
  const poolRef = useRef<WorkerPool | null>(null)
  const startedAt = useRef(0)
  const taken = useRef(new Set<string>())

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme
  }, [prefs.theme])

  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 500)
    return () => clearInterval(t)
  }, [phase])

  const list = useMemo(() => sources.map((s) => jobs[s.id]).filter(Boolean), [sources, jobs])
  const counts = useMemo(() => {
    let complete = 0, failed = 0, processing = 0, warning = 0
    for (const j of list) {
      if (j.status === 'complete') complete++
      else if (j.status === 'warning') { complete++; warning++ }
      else if (j.status === 'failed') failed++
      else if (j.status === 'processing') processing++
    }
    return { complete, failed, processing, warning, total: list.length }
  }, [list])

  const addFiles = useCallback((added: SourceFile[], ignoredCount: number) => {
    setIgnored((n) => n + ignoredCount)
    if (!added.length) return
    setSources((prev) => {
      const seen = new Set(prev.map((p) => `${p.relPath}:${p.file.size}`))
      const fresh = added.filter((a) => !seen.has(`${a.relPath}:${a.file.size}`))
      setJobs((j) => {
        const next = { ...j }
        for (const f of fresh) {
          next[f.id] = {
            id: f.id, file: f.file, name: f.file.name, relPath: f.relPath,
            inBytes: f.file.size, status: 'waiting',
          }
        }
        return next
      })
      return [...prev, ...fresh]
    })
    setPhase('idle')
  }, [])

  const onDrop = useCallback(async (dt: DataTransfer) => {
    const r = await fromDrop(dt, prefs.recursive)
    addFiles(r.files, r.ignored)
  }, [addFiles, prefs.recursive])

  const onPick = useCallback((fl: FileList) => {
    const r = fromFileList(fl, prefs.recursive)
    addFiles(r.files, r.ignored)
  }, [addFiles, prefs.recursive])

  const clearAll = () => {
    poolRef.current?.cancel()
    poolRef.current = null
    setSources([]); setJobs({}); setIgnored(0); setPhase('idle'); setElapsed(0)
    setRanWith(null)
  }

  const removeJob = (id: string) => {
    setSources((s) => s.filter((f) => f.id !== id))
    setJobs((j) => { const n = { ...j }; delete n[id]; return n })
  }

  const convert = () => {
    if (!sources.length) return
    taken.current = new Set()
    setJobs((j) => {
      const n = { ...j }
      for (const s of sources) n[s.id] = { ...n[s.id], status: 'waiting', message: undefined, result: undefined }
      return n
    })
    startedAt.current = Date.now()
    setElapsed(0)
    setRanWith(JSON.stringify(settings))
    setSaveState({ kind: 'idle' })
    setPhase('running')

    const pool = new WorkerPool(settings, {
      onStart: (id) => setJobs((j) => ({ ...j, [id]: { ...j[id], status: 'processing' } })),
      onDone: (id, res) => {
        setJobs((j) => {
          const job = j[id]
          if (!job) return j
          if (!res.ok) {
            return { ...j, [id]: { ...job, status: 'failed', message: res.error } }
          }
          const path = outputPath(job.relPath, res.ext, prefs.preservePaths, taken.current)
          return {
            ...j,
            [id]: {
              ...job,
              status: res.warning ? 'warning' : 'complete',
              message: res.warning,
              srcW: res.srcW, srcH: res.srcH,
              result: {
                outName: path.slice(path.lastIndexOf('/') + 1),
                outPath: path,
                blob: res.blob,
                width: res.width, height: res.height, bytes: res.blob.size,
              },
            },
          }
        })
      },
      onIdle: () => {
        poolRef.current = null
        setElapsed(Date.now() - startedAt.current)
        setPhase('done')
      },
    })
    poolRef.current = pool
    pool.start(sources)
  }

  const cancel = () => {
    poolRef.current?.cancel()
    poolRef.current = null
    setPhase('idle')
    setJobs((j) => {
      const n = { ...j }
      for (const k of Object.keys(n)) {
        if (n[k].status === 'processing' || n[k].status === 'waiting') n[k] = { ...n[k], status: 'waiting' }
      }
      return n
    })
  }

  const togglePause = () => {
    if (phase === 'running') { poolRef.current?.pause(); setPhase('paused') }
    else if (phase === 'paused') { poolRef.current?.resume(); setPhase('running') }
  }

  const exportFiles = async () => {
    const done = list.filter((j) => j.result)
    if (!done.length) return
    if (done.length === 1) {
      saveLocally(done[0].result!.blob, done[0].result!.outName)
      setSaveState({ kind: 'ok', message: `Exported ${done[0].result!.outName}.` })
      return
    }
    setSaveState({ kind: 'busy', message: `Packaging ${done.length} images…` })
    const zip = await buildZip(done.map((j) => ({ path: j.result!.outPath, blob: j.result!.blob })))
    saveLocally(zip, 'reframe-output.zip')
    setSaveState({ kind: 'ok', message: `Exported ${done.length} images as reframe-output.zip.` })
  }

  const saveToFolder = async () => {
    const done = list.filter((j) => j.result)
    setSaveState({ kind: 'busy', message: 'Waiting for the folder picker…' })

    const picked = await pickFolder()
    if (!picked.ok) {
      if (picked.reason === 'cancelled') { setSaveState({ kind: 'idle' }); return }
      setSaveState({
        kind: 'error',
        message: `${picked.detail[0].toUpperCase()}${picked.detail.slice(1)}. Export as ZIP instead.`,
      })
      return
    }
    const sink = picked.sink

    setSaveState({ kind: 'busy', message: `Saving ${done.length} files to ${sink.name}…` })

    let written = 0
    const failures: string[] = []
    let firstError = ''
    for (const j of done) {
      try {
        await sink.write(j.result!.outPath, j.result!.blob)
        written++
      } catch (e) {
        failures.push(j.result!.outPath)
        // Keep the real reason — a generic message makes this impossible to fix.
        if (!firstError) firstError = describeWriteError(e)
      }
    }

    setSaveState(
      failures.length
        ? {
            kind: 'error',
            message:
              written === 0
                ? `Could not write to “${sink.name}” — ${firstError}. Export as ZIP instead.`
                : `Saved ${written} of ${done.length} files to ${sink.name}. ${failures.length} failed — ${firstError}.`,
          }
        : { kind: 'ok', message: `Saved ${written} ${written === 1 ? 'file' : 'files'} to ${sink.name}.` },
    )
  }

  const inTotal = list.reduce((n, j) => n + j.inBytes, 0)
  const okJobs = list.filter((j) => j.result)
  const doneIn = okJobs.reduce((n, j) => n + j.inBytes, 0)
  const doneOut = okJobs.reduce((n, j) => n + j.result!.bytes, 0)
  const busy = phase === 'running' || phase === 'paused'
  const finished = counts.complete + counts.failed
  const rate = elapsed > 250 ? finished / (elapsed / 1000) : 0
  const stale = phase === 'done' && ranWith !== null && ranWith !== JSON.stringify(settings)
  const recap = describeSettings(settings)
  const canWriteFolder = folderSaveAvailable()

  return (
    <div
      className={`app${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void onDrop(e.dataTransfer) }}
    >
      <header className="topbar">
        <div className="brand">
          <h1>Reframe</h1>
          <p>Convert. Resize. Optimise.</p>
        </div>
        <div className="topbar-actions">
          <span className="privacy">
            <span className="dot" aria-hidden="true" />
            Your images never leave your device
          </span>
          <ThemeToggle
            value={prefs.theme}
            onChange={(theme: Theme) => setPrefs({ ...prefs, theme })}
          />
        </div>
      </header>

      <main className="body">
        <section className="pane-list" aria-label="Images">
          {busy && (
            <ProgressPanel
              done={counts.complete + counts.failed}
              total={counts.total}
              active={counts.processing}
              failed={counts.failed}
              elapsed={elapsed}
              paused={phase === 'paused'}
              onPause={togglePause}
              onCancel={cancel}
            />
          )}

          {phase === 'done' && (
            <Summary
              jobs={list}
              elapsed={elapsed}
              canWriteFolder={canWriteFolder}
              onExport={() => void exportFiles()}
              onSaveToFolder={() => void saveToFolder()}
              onRestart={clearAll}
              save={saveState}
            />
          )}

          {sources.length === 0 ? (
            <Dropzone onDrop={onDrop} onPick={onPick} />
          ) : (
            <FileList
              jobs={list}
              ignored={ignored}
              thumbnails={prefs.thumbnails}
              onThumbnails={(v) => setPrefs({ ...prefs, thumbnails: v })}
              onDrop={onDrop}
              onRemove={removeJob}
              onClear={clearAll}
            />
          )}
        </section>

        <aside className="pane-settings" aria-label="Settings">
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            recursive={prefs.recursive}
            preservePaths={prefs.preservePaths}
            onPrefs={(p) => setPrefs({ ...prefs, ...p })}
            disabled={busy}
          />
        </aside>
      </main>

      <footer className="statusbar">
        <div className="status-main" role="status" aria-live="polite">
          <div className="status-line">
            {phase === 'idle' && counts.total === 0 && <span>No images added yet</span>}

            {phase === 'idle' && counts.total > 0 && (
              <span>
                <strong>{counts.total}</strong> {counts.total === 1 ? 'image' : 'images'} ·{' '}
                {bytes(inTotal)}
                {ignored > 0 && ` · ${ignored} unsupported ignored`}
              </span>
            )}

            {busy && (
              <span>
                <strong>{finished}</strong> of {counts.total} · {counts.processing} processing ·{' '}
                {duration(elapsed)}
                {rate > 0 && ` · ${rate.toFixed(1)} img/s`}
                {counts.failed > 0 && ` · ${counts.failed} failed`}
              </span>
            )}

            {phase === 'done' && (
              <span>
                <strong>{counts.complete}</strong> converted
                {counts.failed > 0 && `, ${counts.failed} failed`} ·{' '}
                {bytes(doneIn)} <span aria-hidden="true">→</span> {bytes(doneOut)}
                {doneIn > 0 && ` · saved ${(((doneIn - doneOut) / doneIn) * 100).toFixed(1)}%`} ·{' '}
                {duration(elapsed)}
              </span>
            )}
          </div>

          <div className="status-sub">
            {stale && <span className="flag">Settings changed since this run</span>}
            {recap.map((part) => (
              <span key={part} className="recap">{part}</span>
            ))}
            <span className="recap muted">
              {defaultConcurrency()} worker{defaultConcurrency() === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="status-right">
          {busy ? (
            <>
              <button onClick={togglePause}>{phase === 'paused' ? 'Resume' : 'Pause'}</button>
              <button onClick={cancel}>Cancel</button>
            </>
          ) : (
            <button
              className={`primary big${stale ? ' pulse' : ''}`}
              onClick={convert}
              disabled={!counts.total}
            >
              {phase === 'done' ? 'Convert again' : 'Convert'}
              {counts.total ? ` ${counts.total}` : ''}
            </button>
          )}
        </div>
      </footer>

      {dragging && (
        <div className="drag-overlay" aria-hidden="true">
          <div>Drop to add images</div>
        </div>
      )}
    </div>
  )
}

/** Hand the finished file to the browser — nothing is uploaded anywhere. */
function saveLocally(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
