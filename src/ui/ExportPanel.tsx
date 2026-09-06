import { useCallback } from 'react'
import Section from './Section'
import Hint from './Hint'
import { pickFolder } from '../platform/folder'

interface Props {
  preservePaths: boolean
  onPrefs(p: { preservePaths?: boolean }): void
  exportDir: string | null
  exportAsZip: boolean
  zipFormat: 'zip' | 'gz'
  onExport(dir: string | null, asZip: boolean, format: 'zip' | 'gz'): void
  disabled: boolean
}

export default function ExportPanel({
  preservePaths, onPrefs, exportDir, exportAsZip, zipFormat, onExport, disabled,
}: Props) {
  const handlePickFolder = useCallback(async () => {
    const result = await pickFolder()
    if (result.ok) {
      onExport(result.sink.name, exportAsZip, zipFormat)
    }
  }, [exportAsZip, zipFormat, onExport])

  const exportDirDisplay = exportDir ? exportDir.split(/[/\\]/).pop() : 'Not set'

  return (
    <div className="export-panel">
      <Section
        id="export" title="Export" open={true} onToggle={() => {}}
        summary={exportDir ? `${exportDirDisplay}${exportAsZip ? ' · ZIP' : ''}` : 'Configure'}
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

        <div className="export-folder-group">
          <label className="field">
            <span>
              Export directory
              <Hint text="Images will be saved here automatically after processing completes." />
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
            <Hint text="Compress all processed images into a single file instead of exporting them individually." />
          </span>
        </label>

        {exportAsZip && (
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
