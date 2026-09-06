/**
 * Writing a finished batch into a folder the user picks.
 *
 * Two backends sit behind one interface. In a browser that is the File System
 * Access API; inside the Tauri desktop shell that API is missing on macOS, so
 * we use the native dialog and filesystem plugins instead. Everything above
 * this module only sees `pickFolder`/`restoreFolder` and a `FolderSink`.
 *
 * Both backends can also be "remembered": `pickFolder` returns a small,
 * JSON-serialisable `RememberedFolder` the caller can persist (e.g. in
 * localStorage) and hand back to `restoreFolder` on a later run to reopen
 * the same folder without asking again — a Tauri path is checked with
 * `exists`; a browser handle is kept in IndexedDB and re-checked for
 * permission, since `FileSystemDirectoryHandle` itself can't go in JSON.
 */

export interface FolderSink {
  /** Display name of the chosen folder, for status messages. */
  readonly name: string
  /** Write one file at a path relative to the folder, creating directories. */
  write(relPath: string, blob: Blob): Promise<void>
}

export type PickResult =
  | { ok: true; sink: FolderSink; remember: RememberedFolder }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'unavailable' | 'blocked' | 'failed'; detail: string }

export type RestoreResult =
  | { ok: true; sink: FolderSink }
  | { ok: false; reason: 'missing' | 'denied' | 'unsupported' }

/** What gets persisted so the folder can be reopened without asking again. */
export type RememberedFolder =
  | { kind: 'tauri'; path: string; name: string }
  | { kind: 'fsa'; name: string }

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const folderSaveAvailable = () =>
  isTauri() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window)

/** Reject anything that could escape the chosen folder. */
function safeSegments(relPath: string): string[] {
  const parts = relPath.split('/').filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..' || p.includes('\\') || /^[a-zA-Z]:$/.test(p))) {
    throw new Error(`unsafe output path “${relPath}”`)
  }
  return parts
}

/* ------------------------------------------------------------------ Tauri */

async function tauriModules() {
  const [fs, path] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])
  return { fs, path }
}

function tauriSink(root: string, name: string): FolderSink {
  const madeDirs = new Set<string>()
  return {
    name,
    async write(relPath, blob) {
      const { fs, path } = await tauriModules()
      const parts = safeSegments(relPath)
      const dirParts = parts.slice(0, -1)
      if (dirParts.length) {
        const dir = await path.join(root, ...dirParts)
        if (!madeDirs.has(dir)) {
          await fs.mkdir(dir, { recursive: true })
          madeDirs.add(dir)
        }
      }
      const target = await path.join(root, ...parts)
      await fs.writeFile(target, new Uint8Array(await blob.arrayBuffer()))
    },
  }
}

async function pickNative(): Promise<PickResult> {
  const { open } = await import('@tauri-apps/plugin-dialog')

  let root: string | null
  try {
    // `recursive` is what extends the filesystem scope to subdirectories of
    // the chosen folder. Without it the plugin allows direct children only,
    // and writing a batch that preserves relative paths is denied.
    root = await open({
      directory: true,
      multiple: false,
      recursive: true,
      title: 'Save images to…',
    })
  } catch (e) {
    return { ok: false, reason: 'failed', detail: String(e) }
  }
  if (!root) return { ok: false, reason: 'cancelled' }

  const name = root.split(/[/\\]/).filter(Boolean).pop() ?? root
  return { ok: true, sink: tauriSink(root, name), remember: { kind: 'tauri', path: root, name } }
}

async function restoreNative(saved: { path: string; name: string }): Promise<RestoreResult> {
  try {
    const { fs } = await tauriModules()
    if (!(await fs.exists(saved.path))) return { ok: false, reason: 'missing' }
  } catch {
    // Scope for a previously-picked folder can be lost across app restarts;
    // treat that the same as "missing" so the caller re-prompts.
    return { ok: false, reason: 'missing' }
  }
  return { ok: true, sink: tauriSink(saved.path, saved.name) }
}

/* -------------------------------------------------- File System Access API */

interface FsaPermission {
  queryPermission?(o: { mode: string }): Promise<PermissionState>
  requestPermission?(o: { mode: string }): Promise<PermissionState>
}

async function ensureReadWrite(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  const perm = handle as unknown as FsaPermission
  try {
    let state = (await perm.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
    if (state === 'prompt') state = (await perm.requestPermission?.({ mode: 'readwrite' })) ?? 'granted'
    return state
  } catch {
    // Older implementations lack the permission API; fall through and try.
    return 'granted'
  }
}

function fsaSink(root: FileSystemDirectoryHandle): FolderSink {
  return {
    name: root.name,
    async write(relPath, blob) {
      const parts = safeSegments(relPath)
      let dir = root
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true })
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true })
      const ws = await fh.createWritable()
      await ws.write(blob)
      await ws.close()
    },
  }
}

async function pickWeb(): Promise<PickResult> {
  // Some embedded browsers and webviews expose showDirectoryPicker but never
  // present a dialog, leaving the promise pending forever. Time out rather
  // than looking broken.
  let settled = false
  const stalled = new Promise<PickResult>((resolve) =>
    setTimeout(() => {
      if (!settled) {
        resolve({
          ok: false,
          reason: 'unavailable',
          detail: 'the folder picker did not open — this browser or window does not allow it',
        })
      }
    }, 4000),
  )

  const picker = (async (): Promise<PickResult> => {
    let root: FileSystemDirectoryHandle
    try {
      root = await (window as unknown as {
        showDirectoryPicker(o?: { mode?: string }): Promise<FileSystemDirectoryHandle>
      }).showDirectoryPicker({ mode: 'readwrite' })
      settled = true
    } catch (e) {
      settled = true
      const name = e instanceof DOMException ? e.name : ''
      if (name === 'AbortError') return { ok: false, reason: 'cancelled' }
      return name === 'SecurityError'
        ? { ok: false, reason: 'blocked', detail: 'your browser blocked the folder picker' }
        : { ok: false, reason: 'failed', detail: 'the folder could not be opened' }
    }

    // Choosing a folder does not by itself grant write access — Chrome asks
    // separately, and without this the first write fails with NotAllowedError.
    const state = await ensureReadWrite(root)
    if (state !== 'granted') {
      return {
        ok: false,
        reason: 'blocked',
        detail: `Reframe was not given permission to write to “${root.name}”`,
      }
    }

    await idbSetHandle(root)
    return { ok: true, sink: fsaSink(root), remember: { kind: 'fsa', name: root.name } }
  })()

  return Promise.race([picker, stalled])
}

async function restoreWeb(): Promise<RestoreResult> {
  const handle = await idbGetHandle()
  if (!handle) return { ok: false, reason: 'missing' }
  const state = await ensureReadWrite(handle)
  if (state !== 'granted') return { ok: false, reason: 'denied' }
  return { ok: true, sink: fsaSink(handle) }
}

/* ---------------------------------------------------------------- IndexedDB */

const IDB_NAME = 'reframe-folders'
const IDB_STORE = 'handles'
const IDB_KEY = 'export'

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSetHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await idbOpen()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Best-effort — the folder just won't be remembered across reloads.
  }
}

async function idbGetHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const db = await idbOpen()
    const result = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result
  } catch {
    return undefined
  }
}

/* --------------------------------------------------------------------- API */

export async function pickFolder(): Promise<PickResult> {
  if (isTauri()) return pickNative()
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return pickWeb()
  return {
    ok: false,
    reason: 'unavailable',
    detail: 'this browser cannot write directly to folders',
  }
}

/** Reopen a previously-picked folder without showing a picker, if still possible. */
export async function restoreFolder(saved: RememberedFolder): Promise<RestoreResult> {
  switch (saved?.kind) {
    case 'tauri': return isTauri() ? restoreNative(saved) : { ok: false, reason: 'unsupported' }
    case 'fsa': return restoreWeb()
    default: return { ok: false, reason: 'unsupported' }
  }
}

/** Turn a thrown write error into something a person can act on. */
export function describeWriteError(e: unknown): string {
  if (e instanceof DOMException) {
    return e.name === 'NotAllowedError' ? 'permission to write was refused' : `${e.name}: ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}
