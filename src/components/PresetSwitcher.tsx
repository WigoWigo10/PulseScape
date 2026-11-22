import { useEffect, useRef } from 'react'
import { PRESETS, type PresetId } from '../visualizations/registry'

interface PresetSwitcherProps {
  value: PresetId
  onChange: (id: PresetId) => void
}

/** Controle segmentado para trocar o preset sem afetar o áudio. */
export function PresetSwitcher({ value, onChange }: PresetSwitcherProps) {
  const groupRef = useRef<HTMLDivElement>(null)

  // Em telas estreitas o seletor rola na horizontal: mantém o modo ativo visível.
  useEffect(() => {
    const group = groupRef.current
    const active = group?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!group || !active || group.scrollWidth <= group.clientWidth) return
    const target = active.offsetLeft - (group.clientWidth - active.offsetWidth) / 2
    group.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [value])

  return (
    <div ref={groupRef} className="preset-switcher" role="group" aria-label="Estilo de visualização">
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
