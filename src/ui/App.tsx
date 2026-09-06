import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultSettings, type Job, type Settings, type SourceFile } from '../core/types'
import { fromDrop, fromFileList, outputPath } from '../core/intake'
import { WorkerPool, defaultConcurrency } from '../core/pool'
import { buildZip } from '../core/zip'
import { bytes, duration } from '../core/format'
import { usePersisted } from './usePersisted'
import SettingsPanel from './SettingsPanel'
import ExportPanel from './ExportPanel'
import FileList from './FileList'
import Dropzone from './Dropzone'
import ProgressPanel from './ProgressPanel'
import Summary from './Summary'
import WelcomeModal from './WelcomeModal'
import Modal from './Modal'
import ThemeToggle, { type Theme } from './ThemeToggle'
import { describeSettings } from './describe'
import {
  createFolder, defaultFolder, describeWriteError, folderExists, folderSaveAvailable,
  pickFolder, restoreFolder, type FolderSink, type RememberedFolder,
} from '../platform/folder'

type Phase = 'idle' | 'running' | 'paused' | 'done'

const SIDEBAR_MIN = 260
const SIDEBAR_MAX = 520

interface Prefs {
  theme: Theme
  recursive: boolean
  preservePaths: boolean
  thumbnails: boolean
  exportDir: RememberedFolder | null
  exportAsZip: boolean
  zipFormat: 'zip' | 'gz'
  welcomeShown: boolean
}

export default function App() {
  const [settings, setSettings] = usePersisted<Settings>('reframe.settings', defaultSettings)
  const [prefs, setPrefs] = usePersisted<Prefs>('reframe.prefs', {
    theme: 'system',
    recursive: true,
    preservePaths: true,
    thumbnails: true,
    exportDir: null,
    exportAsZip: true,
    zipFormat: 'zip',
    welcomeShown: false,
  })
  const [showWelcome, setShowWelcome] = useState(!prefs.welcomeShown)

  const [sidebarWidth, setSidebarWidth] = usePersisted<number>('reframe.sidebarWidth', 320)
  const [liveSidebarWidth, setLiveSidebarWidth] = useState<number | null>(null)
  const dragWidth = useRef<number | null>(null)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + (startX - ev.clientX)))
      dragWidth.current = next
      setLiveSidebarWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (dragWidth.current != null) setSidebarWidth(dragWidth.current)
      dragWidth.current = null
      setLiveSidebarWidth(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth, setSidebarWidth])

  const [dragging, setDragging] = useState(false)

  const [sources, setSources] = useState<SourceFile[]>([])
  const [jobs, setJobs] = useState<Record<string, Job>>({})
  const [ignored, setIgnored] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [preparing, setPreparing] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const [ranWith, setRanWith] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({ kind: 'idle' })
  const poolRef = useRef<WorkerPool | null>(null)
  const startedAt = useRef(0)
  const taken = useRef(new Set<string>())
  const folderSinkRef = useRef<FolderSink | null>(null)
  const exportedForRun = useRef(false)

  // When a batch starts but the remembered export folder has been deleted or
  // moved, we ask the user what to do rather than silently picking a new one.
  const [missingDir, setMissingDir] = useState<RememberedFolder | null>(null)
  const missingDirChoice = useRef<((c: 'create' | 'change' | 'cancel') => void) | null>(null)

  const askMissingDir = useCallback(
    (dir: RememberedFolder) =>
      new Promise<'create' | 'change' | 'cancel'>((resolve) => {
        missingDirChoice.current = resolve
        setMissingDir(dir)
      }),
    [],
  )

  const answerMissingDir = useCallback((choice: 'create' | 'change' | 'cancel') => {
    setMissingDir(null)
    missingDirChoice.current?.(choice)
    missingDirChoice.current = null
  }, [])

  const canWriteFolder = folderSaveAvailable()

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

  /** Get a writable folder ready before a batch starts — reusing the one
   *  already open this session, restoring the remembered one if it still
   *  exists, silently resolving a sensible default (desktop only), or
   *  asking the user to pick (or create) one. Every batch writes into a
   *  folder — individually, or as a single archive — so this always runs
   *  when folder access is available at all. */
  const ensureExportFolder = useCallback(async (): Promise<boolean> => {
    if (folderSinkRef.current) return true

    if (prefs.exportDir) {
      if (!(await folderExists(prefs.exportDir))) {
        const choice = await askMissingDir(prefs.exportDir)
        if (choice === 'cancel') return false
        if (choice === 'create') {
          const created = await createFolder(prefs.exportDir)
          if (created.ok) {
            folderSinkRef.current = created.sink
            return true
          }
          setSaveState({
            kind: 'error',
            message: `Could not create “${prefs.exportDir.name}”. Choose a different folder.`,
          })
          // fall through to the picker
        }
        // 'change' (or a failed 'create') falls through to pickFolder below
      } else {
        const restored = await restoreFolder(prefs.exportDir)
        if (restored.ok) {
          folderSinkRef.current = restored.sink
          return true
        }
      }
    } else {
      const fallback = await defaultFolder()
      if (fallback?.ok) {
        folderSinkRef.current = fallback.sink
        setPrefs({ ...prefs, exportDir: fallback.remember })
        return true
      }
    }

    const picked = await pickFolder()
    if (!picked.ok) {
      if (picked.reason !== 'cancelled') {
        setSaveState({
          kind: 'error',
          message: `${picked.detail[0].toUpperCase()}${picked.detail.slice(1)}.`,
        })
      }
      return false
    }
    folderSinkRef.current = picked.sink
    setPrefs({ ...prefs, exportDir: picked.remember })
    return true
  }, [prefs, setPrefs, askMissingDir])

  const convert = async () => {
    if (!sources.length) return

    if (canWriteFolder) {
      setPreparing(true)
      const ready = await ensureExportFolder()
      setPreparing(false)
      if (!ready) return
    }

    exportedForRun.current = false
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

  const handleExportPrefs = (dir: RememberedFolder | null, asZip: boolean, format: 'zip' | 'gz') => {
    // A genuinely new folder was picked (as opposed to just flipping the zip
    // toggle) — drop the cached sink so the next batch reopens the new one
    // instead of silently continuing to write into the old folder.
    if (dir !== prefs.exportDir) folderSinkRef.current = null
    setPrefs({ ...prefs, exportDir: dir, exportAsZip: asZip, zipFormat: format })
  }

  /** Runs exactly once per finished batch — see the guarded effect below. */
  const autoExportFiles = useCallback(async () => {
    const done = list.filter((j) => j.result)
    if (!done.length) return

    const sink = folderSinkRef.current
    // With no folder available at all, there's nowhere to put individual
    // files — always bundle those cases, regardless of the stored toggle.
    const asZip = prefs.exportAsZip || !sink

    if (asZip) {
      try {
        const ext = prefs.zipFormat === 'gz' ? 'tar.gz' : 'zip'
        const filename = `reframe-output.${ext}`
        setSaveState({ kind: 'busy', message: `Packaging ${done.length} image${done.length === 1 ? '' : 's'}…` })
        const zip = await buildZip(done.map((j) => ({ path: j.result!.outPath, blob: j.result!.blob })))
        if (sink) {
          await sink.write(filename, zip)
          setSaveState({ kind: 'ok', message: `Saved ${filename} to ${sink.name}.` })
        } else {
          saveLocally(zip, filename)
          setSaveState({ kind: 'ok', message: `Exported ${done.length} image${done.length === 1 ? '' : 's'} as ${ext.toUpperCase()}.` })
        }
      } catch (e) {
        setSaveState({ kind: 'error', message: `Failed to create archive: ${String(e)}` })
      }
      return
    }

    if (!sink) return // unreachable — asZip is always true when sink is null

    setSaveState({ kind: 'busy', message: `Saving ${done.length} image${done.length === 1 ? '' : 's'} to ${sink.name}…` })

    let written = 0
    const failures: string[] = []
    let firstError = ''
    for (const j of done) {
      try {
        await sink.write(j.result!.outPath, j.result!.blob)
        written++
      } catch (e) {
        failures.push(j.result!.outPath)
        if (!firstError) firstError = describeWriteError(e)
      }
    }

    setSaveState(
      failures.length
        ? {
            kind: 'error',
            message:
              written === 0
                ? `Could not write to “${sink.name}” — ${firstError}.`
                : `Saved ${written} of ${done.length} files to ${sink.name}. ${failures.length} failed — ${firstError}.`,
          }
        : { kind: 'ok', message: `Saved ${written} ${written === 1 ? 'file' : 'files'} to ${sink.name}.` },
    )
  }, [list, prefs.exportAsZip, prefs.zipFormat])

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme
  }, [prefs.theme])

  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 500)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    // The `exportedForRun` guard keeps this to exactly one export per batch,
    // even though `autoExportFiles`'s identity can change for unrelated
    // reasons (e.g. a settings tweak) while the "done" screen is showing.
    if (phase === 'done' && !exportedForRun.current) {
      exportedForRun.current = true
      void autoExportFiles()
    }
  }, [phase, autoExportFiles])

  const inTotal = list.reduce((n, j) => n + j.inBytes, 0)
  const okJobs = list.filter((j) => j.result)
  const doneIn = okJobs.reduce((n, j) => n + j.inBytes, 0)
  const doneOut = okJobs.reduce((n, j) => n + j.result!.bytes, 0)
  const busy = phase === 'running' || phase === 'paused'
  const finished = counts.complete + counts.failed
  const rate = elapsed > 250 ? finished / (elapsed / 1000) : 0
  const stale = phase === 'done' && ranWith !== null && ranWith !== JSON.stringify(settings)
  const recap = describeSettings(settings)

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
          <button
            className="icon-button"
            onClick={() => setShowWelcome(true)}
            title="Help & features"
            aria-label="Help"
          >
            ?
          </button>
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

        <div
          className="resize-handle"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />

        <aside
          className="pane-settings"
          aria-label="Settings"
          style={{ width: liveSidebarWidth ?? sidebarWidth }}
        >
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            recursive={prefs.recursive}
            preservePaths={prefs.preservePaths}
            onPrefs={(p) => setPrefs({ ...prefs, ...p })}
            disabled={busy}
          />
          <ExportPanel
            preservePaths={prefs.preservePaths}
            onPrefs={(p) => setPrefs({ ...prefs, ...p })}
            exportDir={prefs.exportDir}
            exportAsZip={prefs.exportAsZip}
            zipFormat={prefs.zipFormat}
            onExport={handleExportPrefs}
            canWriteFolder={canWriteFolder}
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
              onClick={() => void convert()}
              disabled={!counts.total || preparing}
            >
              {preparing ? 'Choosing folder…' : phase === 'done' ? 'Convert again' : 'Convert'}
              {!preparing && counts.total ? ` ${counts.total}` : ''}
            </button>
          )}
        </div>
      </footer>

      {dragging && (
        <div className="drag-overlay" aria-hidden="true">
          <div>Drop to add images</div>
        </div>
      )}

      {missingDir && (
        <Modal title="Export folder not found" onClose={() => answerMissingDir('cancel')}>
          <p>
            The export folder “{missingDir.name}” no longer exists. It may have
            been moved, renamed, or deleted.
          </p>
          <div className="modal-actions">
            <button onClick={() => answerMissingDir('cancel')}>Cancel</button>
            <button onClick={() => answerMissingDir('change')}>Choose another…</button>
            <button className="primary" onClick={() => answerMissingDir('create')}>
              Create it
            </button>
          </div>
        </Modal>
      )}

      {showWelcome && (
        <WelcomeModal
          initialDontShowAgain={prefs.welcomeShown}
          onClose={(dontShowAgain) => {
            setShowWelcome(false)
            setPrefs({ ...prefs, welcomeShown: dontShowAgain })
          }}
        />
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
