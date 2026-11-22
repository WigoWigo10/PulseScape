import { describe, expect, it } from 'vitest'
import {
  averageLevel,
  computeBandLevels,
  createBandTracker,
  createBandLayout,
  createEnvelope,
  isEnvelopeSilent,
  updateEnvelope,
  type EnvelopeOptions,
} from '../visualizations/spectrumBands'

const SAMPLE_RATE = 48000
const FFT = 4096
const BINS = FFT / 2

describe('createBandLayout', () => {
  const layout = createBandLayout(64, SAMPLE_RATE, FFT)

  it('gera bandas crescentes dentro dos limites, sem o bin DC', () => {
    for (let i = 0; i < layout.count; i++) {
      const lo = layout.lo[i]!
      const hi = layout.hi[i]!
      expect(lo).toBeGreaterThanOrEqual(1)
      expect(hi).toBeGreaterThanOrEqual(lo)
      expect(hi).toBeLessThan(BINS)
      if (i > 0) expect(layout.centerBin[i]!).toBeGreaterThan(layout.centerBin[i - 1]!)
    }
  })

  it('usa escala logarítmica: bandas agudas cobrem mais bins que as graves', () => {
    const width = (i: number) => layout.hi[i]! - layout.lo[i]! + 1
    expect(width(63)).toBeGreaterThan(width(0) * 10)
  })

  it('respeita o limite de Nyquist para taxas baixas', () => {
    const low = createBandLayout(32, 22050, 2048)
    expect(Math.max(...low.hi)).toBeLessThan(1024)
  })
})

describe('computeBandLevels', () => {
  const layout = createBandLayout(32, SAMPLE_RATE, FFT)
  const flat = { tiltPerOctave: 0, gamma: 1 }

  it('silêncio produz zero e máximo produz um', () => {
    const out = new Float32Array(32)
    computeBandLevels(new Uint8Array(BINS), layout, out, flat)
    expect([...out].every((v) => v === 0)).toBe(true)
    computeBandLevels(new Uint8Array(BINS).fill(255), layout, out, flat)
    expect([...out].every((v) => Math.abs(v - 1) < 1e-6)).toBe(true)
  })

  it('silêncio continua zero com as opções padrão (regressão: loop não parava)', () => {
    const out = new Float32Array(32)
    computeBandLevels(new Uint8Array(BINS), layout, out)
    expect([...out].every((v) => v === 0)).toBe(true)
  })

  it('um tom de 1 kHz acende só a banda correspondente', () => {
    const freq = new Uint8Array(BINS)
    const bin = Math.round(1000 / (SAMPLE_RATE / FFT))
    freq[bin] = 255
    const out = new Float32Array(32)
    computeBandLevels(freq, layout, out, flat)
    const lit = [...out].map((v, i) => (v > 0.5 ? i : -1)).filter((i) => i >= 0)
    expect(lit.length).toBeGreaterThanOrEqual(1)
    expect(lit.length).toBeLessThanOrEqual(2)
    const center = layout.centerBin[lit[0]!]! * (SAMPLE_RATE / FFT)
    expect(center).toBeGreaterThan(700)
    expect(center).toBeLessThan(1400)
  })

  it('gamma > 1 reduz níveis intermediários (evita saturação)', () => {
    const freq = new Uint8Array(BINS).fill(128)
    const linear = new Float32Array(32)
    const curved = new Float32Array(32)
    computeBandLevels(freq, layout, linear, flat)
    computeBandLevels(freq, layout, curved, { tiltPerOctave: 0, gamma: 1.6 })
    expect(curved[10]!).toBeLessThan(linear[10]!)
  })
})

describe('createBandTracker / averageLevel', () => {
  const opts: EnvelopeOptions = { attackMs: 30, releaseMs: 100, peakHoldMs: 0, peakFallPerSec: 2 }
  const loud = { frequency: new Uint8Array(BINS).fill(220), sampleRate: SAMPLE_RATE, fftSize: FFT }

  it('reage ao sinal e volta a ficar ocioso em silêncio', () => {
    const tracker = createBandTracker(16, opts)
    expect(tracker.isIdle()).toBe(true)
    tracker.update(loud, 50)
    expect(tracker.isIdle()).toBe(false)
    for (let i = 0; i < 200; i++) tracker.update(null, 16)
    expect(tracker.isIdle()).toBe(true)
  })

  it('deltaMs zero não altera o estado', () => {
    const tracker = createBandTracker(16, opts)
    tracker.update(loud, 0)
    expect(tracker.isIdle()).toBe(true)
  })

  it('averageLevel calcula a média do intervalo e tolera limites', () => {
    expect(averageLevel([0, 1, 1, 0], 1, 3)).toBe(1)
    expect(averageLevel([0.5, 0.5], 0, 10)).toBe(0.5)
    expect(averageLevel([1], 2, 3)).toBe(0)
  })
})

describe('envelope', () => {
  const opts: EnvelopeOptions = { attackMs: 30, releaseMs: 300, peakHoldMs: 200, peakFallPerSec: 1 }

  it('sobe mais rápido do que desce', () => {
    const env = createEnvelope(1)
    updateEnvelope(env, [1], 30, opts)
    const afterAttack = env.levels[0]!
    expect(afterAttack).toBeGreaterThan(0.6)

    const env2 = createEnvelope(1)
    env2.levels[0] = 1
    updateEnvelope(env2, [0], 30, opts)
    expect(1 - env2.levels[0]!).toBeLessThan(afterAttack)
  })

  it('independe da taxa de quadros', () => {
    const a = createEnvelope(1)
    const b = createEnvelope(1)
    for (let i = 0; i < 6; i++) updateEnvelope(a, [1], 1000 / 60, opts)
    for (let i = 0; i < 12; i++) updateEnvelope(b, [1], 1000 / 120, opts)
    expect(a.levels[0]!).toBeCloseTo(b.levels[0]!, 5)
  })

  it('segura o pico e depois o deixa cair até o silêncio', () => {
    const env = createEnvelope(1)
    updateEnvelope(env, [1], 200, opts)
    const peak = env.peaks[0]!
    updateEnvelope(env, [0], 100, opts)
    expect(env.peaks[0]!).toBe(peak) // ainda no hold
    for (let i = 0; i < 300; i++) updateEnvelope(env, [0], 16, opts)
    expect(isEnvelopeSilent(env)).toBe(true)
  })

  it('deltaMs zero não altera o estado', () => {
    const env = createEnvelope(1)
    env.levels[0] = 0.5
    updateEnvelope(env, [1], 0, opts)
    expect(env.levels[0]).toBe(0.5)
  })
})
