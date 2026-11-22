import { PRESETS, type PresetId } from '../visualizations/registry'

interface PresetSwitcherProps {
  value: PresetId
  onChange: (id: PresetId) => void
}

/** Controle segmentado para trocar o preset sem afetar o áudio. */
export function PresetSwitcher({ value, onChange }: PresetSwitcherProps) {
  return (
    <div className="preset-switcher" role="group" aria-label="Estilo de visualização">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="preset-switcher__option"
          aria-pressed={preset.id === value}
          onClick={() => onChange(preset.id)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
