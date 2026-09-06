import type { Settings } from '../core/types'
import PresetBar from './PresetBar'
import Section from './Section'
import Hint from './Hint'
import { usePersisted } from './usePersisted'

interface Props {
  settings: Settings
  onChange(s: Settings): void
  recursive: boolean
  preservePaths: boolean
  onPrefs(p: { recursive?: boolean; preservePaths?: boolean }): void
  disabled: boolean
}

const QUALITY_PRESETS = [
  ['Maximum', 95], ['High', 90], ['Balanced', 82], ['Small', 70],
] as const

const FORMAT_LABEL: Record<Settings['format'], string> = {
  keep: 'Keep original', jpeg: 'JPEG', png: 'PNG', webp: 'WebP', avif: 'AVIF',
}

const FIT_LABEL: Record<Settings['fit'], string> = {
  contain: 'Contain', cover: 'Cover / Crop', pad: 'Pad', stretch: 'Stretch',
}

type OpenMap = Record<string, boolean>

const DEFAULT_OPEN: OpenMap = {
  presets: true, output: true, resize: true, crop: false, trim: false, files: false,
}

export default function SettingsPanel({
  settings: s, onChange, recursive, preservePaths, onPrefs, disabled,
}: Props) {
  const [open, setOpen] = usePersisted<OpenMap>('reframe.sections', DEFAULT_OPEN)
  const toggle = (id: string) => setOpen({ ...open, [id]: !open[id] })

  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch })
  const setResize = (patch: Partial<Settings['resize']>) =>
    onChange({ ...s, resize: { ...s.resize, ...patch } })
  const setTrim = (patch: Partial<Settings['trim']>) =>
    onChange({ ...s, trim: { ...s.trim, ...patch } })

  const lossy = s.format !== 'png'
  const twoDimensional = s.resize.enabled && s.resize.mode === 'wh'

  const resizeSummary = !s.resize.enabled
    ? 'Off'
    : s.resize.mode === 'longest' ? `${s.resize.longest}px longest`
    : s.resize.mode === 'wh' ? `${s.resize.width}×${s.resize.height}`
    : s.resize.mode === 'width' ? `${s.resize.width}px wide`
    : s.resize.mode === 'height' ? `${s.resize.height}px tall`
    : `${s.resize.percent}%`

  return (
    <div className="settings" aria-disabled={disabled}>
      <Section
        id="presets" title="Presets" open={open.presets} onToggle={toggle}
        summary="Saved settings"
        hint="Presets store every setting below. Built-in presets are locked; save your own to reuse them later."
      >
        <PresetBar settings={s} onApply={onChange} disabled={disabled} />
      </Section>

      <Section
        id="output" title="Output" open={open.output} onToggle={toggle}
        summary={`${FORMAT_LABEL[s.format]}${lossy ? ` · Q${s.quality}` : ''}`}
        hint="The format and quality every image is encoded to. Format-specific options appear only when they apply."
      >
        <label className="field">
          <span>
            Format
            <Hint text="WebP and AVIF give the smallest files for the web. PNG is lossless. Keep original re-encodes each image in its existing format." />
          </span>
          <select
            value={s.format} disabled={disabled}
            title="Output image format"
            onChange={(e) => set({ format: e.target.value as Settings['format'] })}
          >
            <option value="keep">Keep Original</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
            <option value="avif">AVIF</option>
          </select>
        </label>

        {lossy && (
          <>
            <label className="field">
              <span>
                Quality
                <Hint text="Higher keeps more detail and makes larger files. 80–90 is usually indistinguishable from the original." />
              </span>
              <div className="slider">
                <input
                  type="range" min={1} max={100} value={s.quality} disabled={disabled}
                  title={`Quality ${s.quality}`}
                  onChange={(e) => set({ quality: Number(e.target.value) })}
                />
                <input
                  type="number" min={1} max={100} value={s.quality} disabled={disabled}
                  aria-label="Quality value" title="Quality (1–100)"
                  onChange={(e) => set({ quality: clampInt(e.target.value, 1, 100) })}
                />
              </div>
            </label>
            <div className="chips">
              {QUALITY_PRESETS.map(([name, q]) => (
                <button
                  key={name} disabled={disabled}
                  className={`chip${s.quality === q ? ' on' : ''}`}
                  title={`Set quality to ${q}`}
                  onClick={() => set({ quality: q })}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="check" title="Use efficient encoder settings and strip data that is not needed">
          <input
            type="checkbox" checked={s.optimise} disabled={disabled}
            onChange={(e) => set({ optimise: e.target.checked })}
          />
          <span>
            Optimise file size
            <Hint text="Encodes efficiently and drops metadata and unused colour profiles, without lowering the quality you set." />
          </span>
        </label>
      </Section>

      <Section
        id="resize" title="Resize" open={open.resize} onToggle={toggle}
        summary={resizeSummary}
        hint="Resizing is independent of format conversion — you can convert without resizing, or resize without converting."
      >
        <label className="check">
          <input
            type="checkbox" checked={s.resize.enabled} disabled={disabled}
            onChange={(e) => setResize({ enabled: e.target.checked })}
          />
          <span>Enabled</span>
        </label>

        {s.resize.enabled && (
          <>
            <label className="field">
              <span>
                Mode
                <Hint text="Longest side suits batches that mix portrait and landscape: each image is scaled so its longer edge hits your number." />
              </span>
              <select
                value={s.resize.mode} disabled={disabled} title="How target dimensions are calculated"
                onChange={(e) => setResize({ mode: e.target.value as Settings['resize']['mode'] })}
              >
                <option value="longest">Longest Side</option>
                <option value="wh">Width &amp; Height</option>
                <option value="width">Width Only</option>
                <option value="height">Height Only</option>
                <option value="percent">Percentage</option>
              </select>
            </label>

            {s.resize.mode === 'longest' && (
              <NumField label="Longest side" unit="px" value={s.resize.longest} disabled={disabled}
                title="The longer edge of every image becomes this size"
                onChange={(v) => setResize({ longest: v })} />
            )}
            {(s.resize.mode === 'wh' || s.resize.mode === 'width') && (
              <NumField label="Width" unit="px" value={s.resize.width} disabled={disabled}
                title="Target width in pixels"
                onChange={(v) => setResize({ width: v })} />
            )}
            {(s.resize.mode === 'wh' || s.resize.mode === 'height') && (
              <NumField label="Height" unit="px" value={s.resize.height} disabled={disabled}
                title="Target height in pixels"
                onChange={(v) => setResize({ height: v })} />
            )}
            {s.resize.mode === 'percent' && (
              <NumField label="Scale" unit="%" value={s.resize.percent} disabled={disabled}
                title="Scale each image by this percentage"
                onChange={(v) => setResize({ percent: v })} />
            )}

            <label className="check">
              <input
                type="checkbox" checked={s.resize.allowEnlarge} disabled={disabled}
                onChange={(e) => setResize({ allowEnlarge: e.target.checked })}
              />
              <span>
                Allow enlargement
                <Hint text="Off by default: images already smaller than the target are left at their own size rather than being scaled up and blurred." />
              </span>
            </label>
          </>
        )}
      </Section>

      {twoDimensional && (
        <Section
          id="crop" title="Crop &amp; Fit" open={open.crop} onToggle={toggle}
          summary={FIT_LABEL[s.fit]}
          hint="Decides what happens when the image aspect ratio does not match the target box."
        >
          <label className="field">
            <span>
              Fit
              <Hint text="Contain fits the whole image inside the box. Cover fills the box and crops the overflow. Pad fits the image and fills the rest with a colour. Stretch distorts." />
            </span>
            <select
              value={s.fit} disabled={disabled} title="How the image fits the target box"
              onChange={(e) => set({ fit: e.target.value as Settings['fit'] })}
            >
              <option value="cover">Cover / Crop</option>
              <option value="contain">Contain</option>
              <option value="pad">Pad</option>
              <option value="stretch">Stretch (distorts)</option>
            </select>
          </label>

          {s.fit === 'cover' && (
            <label className="field">
              <span>
                Crop from
                <Hint text="Smart analyses each image and keeps the busiest region, so subjects are less likely to be cut off." />
              </span>
              <select
                value={s.anchor} disabled={disabled} title="Where the crop is taken from"
                onChange={(e) => set({ anchor: e.target.value as Settings['anchor'] })}
              >
                <option value="smart">Smart / Subject</option>
                <option value="center">Centre</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          )}

          {s.fit === 'pad' && (
            <>
              <NumField label="Subject padding" unit="%" min={0} value={s.subjectPadding} disabled={disabled}
                title="Keep the image clear of the canvas edges"
                hint="Insets the image inside the canvas so a product never touches the edge. 10% is a common choice for catalogue images."
                onChange={(v) => set({ subjectPadding: Math.min(45, v) })} />
              <label className="field">
                <span>
                  Padding
                  <Hint text="The colour filling the space around the image. Transparent is only kept by formats with an alpha channel (PNG, WebP, AVIF)." />
                </span>
                <select
                  value={s.padColor} disabled={disabled} title="Background colour of the padded area"
                  onChange={(e) => set({ padColor: e.target.value })}
                >
                  <option value="transparent">Transparent</option>
                  <option value="#ffffff">White</option>
                  <option value="#000000">Black</option>
                </select>
              </label>
            </>
          )}
        </Section>
      )}

      <Section
        id="trim" title="Trim" open={open.trim} onToggle={toggle}
        summary={s.trim.enabled ? `On · ${s.trim.mode}` : 'Off'}
        hint="Removes empty margins before resizing — useful for product cutouts with a lot of whitespace."
      >
        <label className="check">
          <input
            type="checkbox" checked={s.trim.enabled} disabled={disabled}
            onChange={(e) => setTrim({ enabled: e.target.checked })}
          />
          <span>Trim empty space</span>
        </label>
        {s.trim.enabled && (
          <>
            <label className="field">
              <span>
                Trim
                <Hint text="Auto samples the image corners to work out the background colour. Use Transparent or White when you know what to expect." />
              </span>
              <select
                value={s.trim.mode} disabled={disabled} title="Which margins count as empty"
                onChange={(e) => setTrim({ mode: e.target.value as Settings['trim']['mode'] })}
              >
                <option value="auto">Auto</option>
                <option value="transparent">Transparent</option>
                <option value="white">White</option>
              </select>
            </label>
            <NumField label="Tolerance" unit="%" min={0} value={s.trim.tolerance} disabled={disabled}
              title="How close to the background colour still counts as empty"
              hint="Raise this for photographed backgrounds that are not perfectly uniform; lower it to trim more conservatively."
              onChange={(v) => setTrim({ tolerance: Math.min(100, v) })} />
          </>
        )}
      </Section>

      <Section
        id="files" title="Files" open={open.files} onToggle={toggle}
        summary={`${recursive ? 'Recursive' : 'Top level'}${preservePaths ? ' · Keep folders' : ''}`}
        hint="How folders you add are read, and how the output is arranged."
      >
        <label className="check">
          <input
            type="checkbox" checked={recursive} disabled={disabled}
            onChange={(e) => onPrefs({ recursive: e.target.checked })}
          />
          <span>
            Include subfolders
            <Hint text="Search folders you add for images at any depth, rather than only the top level." />
          </span>
        </label>
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
      </Section>
    </div>
  )
}

function NumField({ label, unit, value, disabled, onChange, min = 1, title, hint }: {
  label: string; unit: string; value: number; disabled: boolean
  onChange(v: number): void; min?: number; title?: string; hint?: string
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <Hint text={hint} />}
      </span>
      <span className="numwrap">
        <input
          type="number" min={min} value={value} disabled={disabled} title={title}
          onChange={(e) => onChange(clampInt(e.target.value, min, 100000))}
        />
        <em>{unit}</em>
      </span>
    </label>
  )
}

function clampInt(raw: string, lo: number, hi: number) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}
