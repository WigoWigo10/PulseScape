import { createMountains } from './mountains'
import { createOscilloscope } from './oscilloscope'
import { createRing } from './ring'
import { createSpectrum, type PresetOptions } from './spectrum'
import { createSphere } from './sphere'
import { createTunnel } from './tunnel'
import type { Visualization } from './types'

/** Presets disponíveis, na ordem exibida no seletor. */
export const PRESETS = [
  { id: 'spectrum', label: 'Barras', create: createSpectrum },
  { id: 'ring', label: 'Anel', create: createRing },
  { id: 'tunnel', label: 'Túnel', create: createTunnel },
  { id: 'mountains', label: 'Montanhas', create: createMountains },
  { id: 'sphere', label: 'Esfera', create: createSphere },
  { id: 'oscilloscope', label: 'Onda', create: createOscilloscope },
] as const satisfies readonly {
  id: string
  label: string
  create: (options?: PresetOptions) => Visualization
}[]

export type PresetId = (typeof PRESETS)[number]['id']

export const DEFAULT_PRESET: PresetId = 'ring'

export function getPreset(id: PresetId) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
}
