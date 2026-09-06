import type { Settings, SourceFile, WorkerRequest, WorkerResponse } from './types'

export interface PoolEvents {
  onStart(id: string): void
  onDone(id: string, res: WorkerResponse): void
  onIdle(): void
}

/** How many workers to run. Spec: cores - 1, with sane bounds. */
export function defaultConcurrency(): number {
  const cores = navigator.hardwareConcurrency || 4
  return Math.max(1, Math.min(8, cores - 1))
}

/**
 * A fixed pool of processing workers fed from a queue. The UI subscribes to
 * job events rather than talking to workers directly.
 */
export class WorkerPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: SourceFile[] = []
  private inFlight = new Map<Worker, string>()
  private paused = false
  private cancelled = false

  constructor(
    private settings: Settings,
    private events: PoolEvents,
    private size = defaultConcurrency(),
  ) {}

  get active() { return this.inFlight.size }
  get pending() { return this.queue.length }

  start(files: SourceFile[]) {
    this.queue = [...files]
    this.cancelled = false
    this.paused = false
    for (let i = 0; i < Math.min(this.size, this.queue.length); i++) {
      const w = new Worker(new URL('../workers/process.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => this.finish(w, ev.data)
      w.onerror = () => {
        const id = this.inFlight.get(w)
        if (id) this.finish(w, { id, ok: false, error: 'The processing worker stopped unexpectedly.' })
      }
      this.workers.push(w)
      this.idle.push(w)
    }
    this.pump()
  }

  pause() { this.paused = true }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.pump()
  }

  cancel() {
    this.cancelled = true
    this.queue = []
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.idle = []
    this.inFlight.clear()
  }

  private finish(w: Worker, res: WorkerResponse) {
    this.inFlight.delete(w)
    this.idle.push(w)
    this.events.onDone(res.id, res)
    this.pump()
  }

  private pump() {
    if (this.cancelled) return
    while (!this.paused && this.queue.length && this.idle.length) {
      const w = this.idle.pop()!
      const job = this.queue.shift()!
      this.inFlight.set(w, job.id)
      this.events.onStart(job.id)
      const msg: WorkerRequest = { id: job.id, file: job.file, relPath: job.relPath, settings: this.settings }
      w.postMessage(msg)
    }
    if (!this.queue.length && !this.inFlight.size) {
      for (const w of this.workers) w.terminate()
      this.workers = []
      this.idle = []
      this.events.onIdle()
    }
  }
}
