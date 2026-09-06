import { useEffect, useState } from 'react'
import type { Job } from '../core/types'

/**
 * Row thumbnail. Shows the source image, then swaps to the processed result
 * once a job completes so the batch visibly progresses. Object URLs are
 * revoked on unmount to keep large batches from pinning memory.
 */
export default function Thumb({ job, enabled, large }: { job: Job; enabled: boolean; large?: boolean }) {
  const blob = job.result?.blob ?? job.file
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!enabled) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => { URL.revokeObjectURL(u); setUrl(undefined) }
  }, [blob, enabled])

  const cls = `thumb${large ? ' thumb-lg' : ''}`
  if (!enabled) return <span className={`${cls} thumb-off`} aria-hidden="true" />
  return (
    <span className={cls} aria-hidden="true">
      {url && <img src={url} alt="" loading="lazy" decoding="async" />}
    </span>
  )
}
