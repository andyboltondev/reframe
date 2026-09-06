export type Theme = 'system' | 'light' | 'dark'

const OPTIONS: { value: Theme; label: string; glyph: string }[] = [
  { value: 'system', label: 'Auto', glyph: '◐' },
  { value: 'light', label: 'Light', glyph: '☀' },
  { value: 'dark', label: 'Dark', glyph: '☾' },
]

export default function ThemeToggle({
  value, onChange,
}: { value: Theme; onChange(v: Theme): void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : undefined}
          title={o.value === 'system' ? 'Match the system theme' : `${o.label} theme`}
          onClick={() => onChange(o.value)}
        >
          <span aria-hidden="true">{o.glyph}</span>
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}
