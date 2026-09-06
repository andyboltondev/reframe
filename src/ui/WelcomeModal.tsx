import { useState } from 'react'

interface Props {
  /** `dontShowAgain` is true when the user checked the box before dismissing. */
  onClose(dontShowAgain: boolean): void
  /** Reflects the current persisted preference, so reopening via Help shows accurate state. */
  initialDontShowAgain: boolean
}

export default function WelcomeModal({ onClose, initialDontShowAgain }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(initialDontShowAgain)

  return (
    <div className="modal-overlay">
      <div className="modal welcome-modal">
        <div className="modal-header">
          <h2>Welcome to Reframe</h2>
          <button className="modal-close" onClick={() => onClose(dontShowAgain)} aria-label="Close" title="Close">
            ✕
          </button>
        </div>

        <div className="modal-content">
          <section className="welcome-section">
            <h3>What Reframe does</h3>
            <ul>
              <li><strong>Convert formats</strong> — Save as JPEG, PNG, WebP, AVIF, or keep the original</li>
              <li><strong>Resize images</strong> — Scale by pixel count, percentage, or fixed dimensions</li>
              <li><strong>Optimize files</strong> — Reduce file size without losing visible quality</li>
              <li><strong>Batch process</strong> — Convert hundreds of images at once</li>
            </ul>
          </section>

          <section className="welcome-section privacy-callout">
            <div className="privacy-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>
            <h3>Privacy</h3>
            <p>
              <strong>No data is transferred off your device.</strong> All image processing happens in your browser or on your computer. Your images never leave your device, and nothing is sent to the internet.
            </p>
          </section>

          <section className="welcome-section">
            <h3>Quick start</h3>
            <ol>
              <li>Drag images onto the window, or click to pick files</li>
              <li>Adjust settings on the right (format, resize, quality, etc.)</li>
              <li>Click <strong>Convert</strong> to process your batch</li>
              <li>Images export automatically to your chosen folder</li>
            </ol>
          </section>

          <section className="welcome-section">
            <h3>Tips</h3>
            <ul>
              <li>Presets save your favorite settings for reuse</li>
              <li>Use "Preserve relative paths" to keep folder structure intact</li>
              <li>Export as archive to bundle everything into a single file</li>
            </ul>
          </section>
        </div>

        <div className="modal-footer">
          <label className="check">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>Don't show again</span>
          </label>
          <button className="primary" onClick={() => onClose(dontShowAgain)}>
            Get started
          </button>
        </div>
      </div>
    </div>
  )
}
