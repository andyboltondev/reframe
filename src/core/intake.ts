import type { SourceFile } from './types'

const SUPPORTED = /\.(jpe?g|png|gif|tiff?|webp|bmp|avif|heic|heif)$/i

export interface Intake {
  files: SourceFile[]
  ignored: number
}

let seq = 0
const nextId = () => `f${++seq}`

function accept(name: string) { return SUPPORTED.test(name) }

/** Read a DataTransfer, walking directories where the browser exposes them. */
export async function fromDrop(dt: DataTransfer, recursive: boolean): Promise<Intake> {
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  if (!entries.length) return fromFileList(dt.files, recursive)

  const out: SourceFile[] = []
  let ignored = 0
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej))
      if (accept(file.name)) out.push({ id: nextId(), file, relPath: prefix + file.name })
      else ignored++
      return
    }
    if (!recursive && prefix.includes('/')) return
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
        reader.readEntries(res, rej))
      if (!batch.length) break
      for (const e of batch) await walk(e, `${prefix}${entry.name}/`)
    }
  }
  for (const e of entries) await walk(e, '')
  return { files: out, ignored }
}

/** Read an <input type="file"> selection, honouring webkitRelativePath. */
export function fromFileList(list: FileList, recursive: boolean): Intake {
  const out: SourceFile[] = []
  let ignored = 0
  for (const file of Array.from(list)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const path = rel.includes('/') ? rel.split('/').slice(1).join('/') : file.name
    if (!accept(file.name)) { ignored++; continue }
    if (!recursive && path.includes('/')) continue
    out.push({ id: nextId(), file, relPath: path })
  }
  return { files: out, ignored }
}

/** Build the output path, preserving folders and de-duplicating names. */
export function outputPath(
  relPath: string,
  ext: string,
  preservePaths: boolean,
  taken: Set<string>,
): string {
  const dir = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/') + 1) : ''
  const base = relPath.slice(relPath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
  const prefix = preservePaths ? dir : ''
  let path = `${prefix}${base}.${ext}`
  let n = 2
  while (taken.has(path.toLowerCase())) path = `${prefix}${base}-${n++}.${ext}`
  taken.add(path.toLowerCase())
  return path
}
