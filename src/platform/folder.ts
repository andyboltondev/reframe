/**
 * Writing a finished batch into a folder the user picks.
 *
 * Two backends sit behind one interface. In a browser that is the File System
 * Access API; inside the Tauri desktop shell that API is missing on macOS, so
 * we use the native dialog and filesystem plugins instead. Everything above
 * this module only sees `pickFolder` and a `FolderSink`.
 */

export interface FolderSink {
  /** Display name of the chosen folder, for status messages. */
  readonly name: string
  /** Write one file at a path relative to the folder, creating directories. */
  write(relPath: string, blob: Blob): Promise<void>
}

export type PickResult =
  | { ok: true; sink: FolderSink }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'unavailable' | 'blocked' | 'failed'; detail: string }

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

async function pickNative(): Promise<PickResult> {
  const [{ open }, { mkdir, writeFile }, { join }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])

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
  const madeDirs = new Set<string>()

  return {
    ok: true,
    sink: {
      name,
      async write(relPath, blob) {
        const parts = safeSegments(relPath)
        const dirParts = parts.slice(0, -1)
        if (dirParts.length) {
          const dir = await join(root, ...dirParts)
          if (!madeDirs.has(dir)) {
            await mkdir(dir, { recursive: true })
            madeDirs.add(dir)
          }
        }
        const target = await join(root, ...parts)
        await writeFile(target, new Uint8Array(await blob.arrayBuffer()))
      },
    },
  }
}

/* -------------------------------------------------- File System Access API */

interface FsaPermission {
  queryPermission?(o: { mode: string }): Promise<PermissionState>
  requestPermission?(o: { mode: string }): Promise<PermissionState>
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
    const perm = root as unknown as FsaPermission
    try {
      let state = (await perm.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
      if (state === 'prompt') state = (await perm.requestPermission?.({ mode: 'readwrite' })) ?? 'granted'
      if (state !== 'granted') {
        return {
          ok: false,
          reason: 'blocked',
          detail: `Reframe was not given permission to write to “${root.name}”`,
        }
      }
    } catch {
      // Older implementations lack the permission API; fall through and try.
    }

    return {
      ok: true,
      sink: {
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
      },
    }
  })()

  return Promise.race([picker, stalled])
}

export async function pickFolder(): Promise<PickResult> {
  if (isTauri()) return pickNative()
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return pickWeb()
  return {
    ok: false,
    reason: 'unavailable',
    detail: 'this browser cannot write directly to folders',
  }
}

/** Turn a thrown write error into something a person can act on. */
export function describeWriteError(e: unknown): string {
  if (e instanceof DOMException) {
    return e.name === 'NotAllowedError' ? 'permission to write was refused' : `${e.name}: ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}
