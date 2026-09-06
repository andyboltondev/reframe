export type OutputFormat = 'keep' | 'jpeg' | 'png' | 'webp' | 'avif'

export type ResizeMode = 'none' | 'wh' | 'longest' | 'width' | 'height' | 'percent'

export type FitMode = 'contain' | 'cover' | 'stretch' | 'pad'

export type CropAnchor =
  | 'center' | 'top' | 'bottom' | 'left' | 'right' | 'smart'

export type TrimMode = 'transparent' | 'white' | 'auto'

export interface Settings {
  format: OutputFormat
  quality: number
  optimise: boolean

  resize: {
    enabled: boolean
    mode: ResizeMode
    width: number
    height: number
    longest: number
    percent: number
    allowEnlarge: boolean
  }

  fit: FitMode
  anchor: CropAnchor
  /** Inset the subject from the canvas edges, as a % of the canvas (pad fit). */
  subjectPadding: number
  padColor: string // '#ffffff' or 'transparent'

  trim: {
    enabled: boolean
    mode: TrimMode
    tolerance: number
  }
}

export const defaultSettings: Settings = {
  format: 'webp',
  quality: 85,
  optimise: true,
  resize: {
    enabled: true,
    mode: 'longest',
    width: 1200,
    height: 1200,
    longest: 1600,
    percent: 50,
    allowEnlarge: false,
  },
  fit: 'cover',
  anchor: 'smart',
  subjectPadding: 0,
  padColor: '#ffffff',
  trim: { enabled: false, mode: 'auto', tolerance: 5 },
}

export type JobStatus = 'waiting' | 'processing' | 'complete' | 'warning' | 'failed'

export interface SourceFile {
  id: string
  file: File
  /** path relative to the dropped root, e.g. "shoes/red.jpg" */
  relPath: string
}

export interface JobResult {
  outName: string
  outPath: string
  blob: Blob
  width: number
  height: number
  bytes: number
}

export interface Job {
  id: string
  /** Kept so the list can render a thumbnail without re-reading from disk. */
  file: File
  name: string
  relPath: string
  inBytes: number
  status: JobStatus
  message?: string
  srcW?: number
  srcH?: number
  result?: JobResult
}

/** Message sent to a worker. */
export interface WorkerRequest {
  id: string
  file: File
  relPath: string
  settings: Settings
}

export type WorkerResponse =
  | {
      id: string
      ok: true
      blob: Blob
      ext: string
      width: number
      height: number
      srcW: number
      srcH: number
      warning?: string
    }
  | { id: string; ok: false; error: string }
