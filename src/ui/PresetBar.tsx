import { useRef, useState } from 'react'
import type { Settings } from '../core/types'
import { exportPresets, parsePresetFile, uniqueName, type ParsedPreset, type Preset } from '../core/presets'
import { usePresets } from './usePresets'
import Modal from './Modal'
import Menu from './Menu'

interface Props {
  settings: Settings
  onApply(s: Settings): void
  disabled: boolean
}

type Choice = 'overwrite' | 'rename' | 'cancel'

export default function PresetBar({ settings, onApply, disabled }: Props) {
  const store = usePresets()
  const [selectedId, setSelectedId] = useState('')
  const [naming, setNaming] = useState<null | { mode: 'save' | 'rename'; value: string }>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState('')
  const [queue, setQueue] = useState<ParsedPreset[] | null>(null)
  const [applyAll, setApplyAll] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const selected: Preset | undefined = store.all.find((p) => p.id === selectedId)
  const editable = !!selected && !selected.builtIn
  const dirty =
    !!selected && JSON.stringify(selected.settings) !== JSON.stringify(settings)

  const apply = (id: string) => {
    setSelectedId(id)
    setNote('')
    const preset = store.all.find((p) => p.id === id)
    if (preset) onApply(structuredClone(preset.settings))
  }

  /* ----------------------------------------------------------- naming --- */

  const submitName = () => {
    if (!naming) return
    const name = naming.value.trim()
    if (!name) return

    if (naming.mode === 'save') {
      const taken = store.names.filter((n) => n.toLowerCase() !== selected?.name.toLowerCase())
      const final = uniqueName(name, taken)
      const preset = store.create(final, settings)
      setSelectedId(preset.id)
      setNote(final === name ? `Saved preset “${final}”.` : `Saved as “${final}” — that name was taken.`)
    } else if (selected && editable) {
      const taken = store.names.filter((n) => n.toLowerCase() !== selected.name.toLowerCase())
      const final = uniqueName(name, taken)
      store.update(selected.id, { name: final })
      setNote(`Renamed to “${final}”.`)
    }
    setNaming(null)
  }

  /* ----------------------------------------------------------- export --- */

  const download = (text: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const exportOne = () => {
    if (!selected) return
    download(exportPresets([selected]), `${slug(selected.name)}.reframe-preset.json`)
    setNote(`Exported “${selected.name}”.`)
  }

  const exportAll = () => {
    if (!store.custom.length) return
    download(exportPresets(store.custom), 'reframe-presets.json')
    setNote(`Exported ${store.custom.length} presets.`)
  }

  /* ----------------------------------------------------------- import --- */

  const startImport = async (file: File) => {
    let parsed: ParsedPreset[]
    try {
      parsed = parsePresetFile(await file.text())
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That file could not be read.')
      return
    }
    setApplyAll(false)
    consume(parsed, 0)
  }

  /** Import in order, pausing on each name conflict so the user can decide. */
  const consume = (items: ParsedPreset[], added: number) => {
    const clean: ParsedPreset[] = []
    let rest: ParsedPreset[] = []

    for (let i = 0; i < items.length; i++) {
      const clash = store.names.some((n) => n.toLowerCase() === items[i].name.toLowerCase()) ||
        clean.some((c) => c.name.toLowerCase() === items[i].name.toLowerCase())
      if (clash) { rest = items.slice(i); break }
      clean.push(items[i])
    }

    // One batched write — importing many at once must not clobber earlier adds.
    if (clean.length) store.importPresets(clean, 'rename')

    if (rest.length) { setQueue(rest); setNote(''); return }

    const total = added + clean.length
    setQueue(null)
    setNote(total ? `Imported ${total} ${total === 1 ? 'preset' : 'presets'}.` : 'Nothing imported.')
  }

  const resolve = (choice: Choice) => {
    if (!queue) return
    const [current, ...rest] = queue

    if (choice === 'cancel') {
      setQueue(null)
      setNote('Import cancelled.')
      return
    }

    if (applyAll) {
      // Same choice for this conflict and every remaining one, in one write.
      const count = store.importPresets([current, ...rest], choice)
      setQueue(null)
      setNote(`Imported ${count} ${count === 1 ? 'preset' : 'presets'}.`)
      return
    }

    store.importPresets([current], choice)

    if (!rest.length) { setQueue(null); setNote('Import complete.'); return }
    consume(rest, 1)
  }

  const conflict = queue?.[0]
  const conflictsBuiltIn = !!conflict &&
    store.all.some((p) => p.builtIn && p.name.toLowerCase() === conflict.name.toLowerCase())

  return (
    <div className="presets">
      <select
        aria-label="Preset"
        value={selectedId}
        disabled={disabled}
        onChange={(e) => apply(e.target.value)}
      >
        <option value="">Choose a preset…</option>
        <optgroup label="Built in">
          {store.all.filter((p) => p.builtIn).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
        {store.custom.length > 0 && (
          <optgroup label="My presets">
            {store.custom.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      {selected && (
        <p className="preset-state muted">
          {selected.builtIn && <span className="lock" title="Built-in presets cannot be changed">🔒 Built in</span>}
          {dirty ? ' Settings modified since applying.' : ' Matches current settings.'}
        </p>
      )}

      <div className="preset-actions">
        <Menu
          label="Manage"
          disabled={disabled}
          items={[
            {
              label: 'Save as new preset…',
              hint: 'Store the current settings under a new name',
              onSelect: () => setNaming({ mode: 'save', value: suggestName(selected?.name) }),
            },
            {
              label: 'Update with current settings',
              disabled: !editable || !dirty,
              hint: !selected
                ? 'Select one of your presets first'
                : selected.builtIn
                  ? 'Built-in presets are locked'
                  : dirty ? 'Overwrite this preset with the settings shown' : 'Nothing has changed',
              onSelect: () => {
                if (!selected) return
                store.update(selected.id, { settings: structuredClone(settings) })
                setNote(`Updated “${selected.name}”.`)
              },
            },
            {
              label: 'Rename…',
              disabled: !editable,
              hint: selected?.builtIn ? 'Built-in presets are locked' : 'Give this preset a new name',
              onSelect: () => setNaming({ mode: 'rename', value: selected!.name }),
            },
            {
              label: 'Delete…',
              disabled: !editable,
              danger: true,
              hint: selected?.builtIn ? 'Built-in presets are locked' : 'Remove this preset',
              onSelect: () => setConfirmDelete(true),
            },
            {
              label: 'Export this preset…',
              disabled: !selected,
              separated: true,
              hint: 'Save the selected preset as a JSON file',
              onSelect: exportOne,
            },
            {
              label: 'Export all my presets…',
              disabled: !store.custom.length,
              hint: 'Save every preset you have created as one JSON file',
              onSelect: exportAll,
            },
            {
              label: 'Import presets…',
              hint: 'Load presets from a JSON file',
              onSelect: () => fileRef.current?.click(),
            },
          ]}
        />
      </div>

      {note && <p className="preset-note" role="status">{note}</p>}

      <input
        ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void startImport(f)
        }}
      />

      {naming && (
        <Modal
          title={naming.mode === 'save' ? 'Save preset' : 'Rename preset'}
          onClose={() => setNaming(null)}
        >
          <label className="modal-field">
            <span>Preset name</span>
            <input
              value={naming.value}
              maxLength={60}
              onChange={(e) => setNaming({ ...naming, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') submitName() }}
            />
          </label>
          <div className="modal-actions">
            <button onClick={() => setNaming(null)}>Cancel</button>
            <button className="primary" onClick={submitName} disabled={!naming.value.trim()}>
              {naming.mode === 'save' ? 'Save' : 'Rename'}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && selected && (
        <Modal title="Delete preset" onClose={() => setConfirmDelete(false)}>
          <p>Delete “{selected.name}”? This cannot be undone.</p>
          <div className="modal-actions">
            <button onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button
              className="danger"
              onClick={() => {
                store.remove(selected.id)
                setSelectedId('')
                setConfirmDelete(false)
                setNote(`Deleted “${selected.name}”.`)
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {conflict && (
        <Modal title="Preset name already exists" onClose={() => resolve('cancel')}>
          <p>
            A preset called <strong>“{conflict.name}”</strong> already exists
            {conflictsBuiltIn && ' as a built-in preset, which cannot be replaced'}.
          </p>
          {queue.length > 1 && (
            <label className="check">
              <input
                type="checkbox" checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
              />
              <span>Apply this choice to the remaining {queue.length - 1} conflicts</span>
            </label>
          )}
          <div className="modal-actions stack">
            <button
              onClick={() => resolve('overwrite')}
              disabled={conflictsBuiltIn}
              title={conflictsBuiltIn ? 'Built-in presets are locked' : undefined}
            >
              Overwrite existing
            </button>
            <button className="primary" onClick={() => resolve('rename')}>
              Add as “{uniqueName(conflict.name, store.names)}”
            </button>
            <button onClick={() => resolve('cancel')}>Cancel import</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset'
}

function suggestName(current?: string) {
  return current ? `${current} copy` : 'My preset'
}
