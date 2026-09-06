import { useCallback } from 'react'
import Section from './Section'
import Hint from './Hint'
import { pickFolder, type RememberedFolder } from '../platform/folder'

interface Props {
  preservePaths: boolean
  onPrefs(p: { preservePaths?: boolean }): void
  exportDir: RememberedFolder | null
  exportAsZip: boolean
  zipFormat: 'zip' | 'gz'
  onExport(dir: RememberedFolder | null, asZip: boolean, format: 'zip' | 'gz'): void
  canWriteFolder: boolean
  disabled: boolean
}

export default function ExportPanel({
  preservePaths, onPrefs, exportDir, exportAsZip, zipFormat, onExport, canWriteFolder, disabled,
}: Props) {
  const handlePickFolder = useCallback(async () => {
    const result = await pickFolder()
    if (result.ok) {
      onExport(result.remember, exportAsZip, zipFormat)
    }
  }, [exportAsZip, zipFormat, onExport])

  const exportDirDisplay = exportDir ? exportDir.name : 'Not set'
  const zipForced = !canWriteFolder

  return (
    <div className="export-panel">
      <Section
        id="export" title="Export" open={true} onToggle={() => {}}
        summary={zipForced || exportAsZip ? `Archive (${zipFormat.toUpperCase()})` : exportDirDisplay}
        hint="Where and how to save processed images automatically."
      >
        <label className="check">
          <input
            type="checkbox" checked={preservePaths} disabled={disabled}
            onChange={(e) => onPrefs({ preservePaths: e.target.checked })}
          />
          <span>
            Preserve relative paths
            <Hint text="Recreate the original folder structure in the output. When off, everything lands in one flat folder and clashing names are numbered." />
          </span>
        </label>

        {zipForced ? (
          <p className="export-note">
            This browser can't write straight to folders, so images export as an archive instead.
          </p>
        ) : (
          <>
            <div className="export-folder-group">
              <label className="field">
                <span>
                  Export directory
                  <Hint text="Images will be saved here automatically after processing completes. You'll be asked to pick this again if it's ever missing." />
                </span>
                <div className="export-folder-display">
                  <span className="folder-name">{exportDirDisplay}</span>
                  <button
                    className="secondary small"
                    onClick={handlePickFolder}
                    disabled={disabled}
                    title="Choose export folder"
                  >
                    Change…
                  </button>
                </div>
              </label>
            </div>

            <label className="check">
              <input
                type="checkbox" checked={exportAsZip} disabled={disabled}
                onChange={(e) => onExport(exportDir, e.target.checked, zipFormat)}
                title="Bundle all images into an archive file"
              />
              <span>
                Export as archive
                <Hint text="Compress all processed images into a single file instead of exporting them individually to the folder above." />
              </span>
            </label>
          </>
        )}

        {(zipForced || exportAsZip) && (
          <label className="field">
            <span>Format</span>
            <select
              value={zipFormat} disabled={disabled}
              title="Archive format"
              onChange={(e) => onExport(exportDir, true, e.target.value as 'zip' | 'gz')}
            >
              <option value="zip">ZIP</option>
              <option value="gz">GZIP (.tar.gz)</option>
            </select>
          </label>
        )}

        <p className="export-note">
          Files export automatically when processing completes. Your images never leave your device.
        </p>
      </Section>
    </div>
  )
}
