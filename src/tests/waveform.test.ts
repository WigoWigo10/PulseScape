import { describe, expect, it } from 'vitest'
import { createWaveformTracker, findTrigger } from '../visualizations/waveform'

/** Senoide em bytes (128 ± 100), com fase em amostras. */
function sine(length: number, period: number, phase = 0): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = Math.round(128 + 100 * Math.sin((2 * Math.PI * (i + phase)) / period))
  return out
}

describe('findTrigger', () => {
  it('encontra o cruzamento ascendente de zero', () => {
    const td = sine(1024, 64, 32) // começa no meio do ciclo (descendo)
    const t = findTrigger(td, 512)
    expect(td[t - 1]!).toBeLessThan(128)
    expect(td[t]!).toBeGreaterThanOrEqual(128)
  })

  it('retorna 0 em silêncio', () => {
    expect(findTrigger(new Uint8Array(1024).fill(128), 512)).toBe(0)
  })
})

describe('createWaveformTracker', () => {
  it('estabiliza a imagem independentemente da fase de entrada', () => {
    const a = createWaveformTracker(64, 1)
    const b = createWaveformTracker(64, 1)
    a.update(sine(2048, 128, 0), 1000)
    b.update(sine(2048, 128, 37), 1000)
    for (let i = 0; i < 64; i++) expect(a.samples[i]!).toBeCloseTo(b.samples[i]!, 1)
  })

  it('normaliza para [-1, 1] e decai até ficar ocioso sem sinal', () => {
    const w = createWaveformTracker(64, 20)
    w.update(sine(2048, 128), 1000)
    const max = Math.max(...w.samples.map(Math.abs))
    expect(max).toBeGreaterThan(0.7)
    expect(max).toBeLessThanOrEqual(1)
    expect(w.isIdle()).toBe(false)
    for (let i = 0; i < 100; i++) w.update(null, 16)
    expect(w.isIdle()).toBe(true)
  })

  it('aplica o ganho da faixa e limita a [-1, 1]', () => {
    const quiet = new Uint8Array(2048)
    for (let i = 0; i < quiet.length; i++) quiet[i] = Math.round(128 + 16 * Math.sin((2 * Math.PI * i) / 128))
    const plain = createWaveformTracker(64, 1)
    const boosted = createWaveformTracker(64, 1)
    const clipped = createWaveformTracker(64, 1)
    plain.update(quiet, 1000)
    boosted.update(quiet, 1000, 4)
    clipped.update(quiet, 1000, 100)
    const max = (w: { samples: Float32Array }) => Math.max(...w.samples.map(Math.abs))
    expect(max(boosted)).toBeCloseTo(max(plain) * 4, 1)
    expect(max(clipped)).toBeLessThanOrEqual(1)
  })

  it('deltaMs zero não altera o estado', () => {
    const w = createWaveformTracker(16, 20)
    w.update(sine(2048, 128), 0)
    expect(w.isIdle()).toBe(true)
  })
})
