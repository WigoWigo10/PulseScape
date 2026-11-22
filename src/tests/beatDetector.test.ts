import { describe, expect, it } from 'vitest'
import { bassFlux, createBeatDetector } from '../visualizations/beatDetector'

const FRAME = 1000 / 60

/** Gerador pseudoaleatório determinístico (testes reprodutíveis). */
function noise(seed = 1) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

/** Simula `seconds` de quadros; `fluxAt(ms)` dá o fluxo de graves no instante. */
function run(fluxAt: (ms: number) => number, seconds: number) {
  const detector = createBeatDetector()
  const beats: number[] = []
  for (let t = 0; t < seconds * 1000; t += FRAME) {
    if (detector.update(fluxAt(t), FRAME) > 0) beats.push(t)
  }
  return { detector, beats }
}

/** Golpes: fluxo alto por 2 quadros a cada `periodMs`, sobre ruído de fundo pequeno. */
function hits(periodMs: number, hit = 0.08, floor = 0.002) {
  const rand = noise()
  return (ms: number) => (ms % periodMs < FRAME * 2 ? hit : floor * rand())
}

describe('bassFlux', () => {
  it('soma só as subidas no intervalo e atualiza o anterior', () => {
    const previous = new Float32Array([0.5, 0.5, 0.5, 0.5])
    const flux = bassFlux([0.9, 0.7, 0.3, 0.5], previous, 0, 4)
    expect(flux).toBeCloseTo((0.4 + 0.2) / 4, 5) // a queda (0,5→0,3) não conta
    expect([...previous]).toEqual([expect.closeTo(0.9, 5), expect.closeTo(0.7, 5), expect.closeTo(0.3, 5), 0.5])
  })

  it('nível sustentado (sem mudança) tem fluxo zero', () => {
    const previous = new Float32Array([0.6, 0.6])
    expect(bassFlux([0.6, 0.6], previous, 0, 2)).toBe(0)
  })
})

describe('createBeatDetector', () => {
  it('detecta cada golpe de um ritmo de 120 BPM', () => {
    const { beats } = run(hits(500), 4)
    expect(beats.length).toBeGreaterThanOrEqual(7)
    expect(beats.length).toBeLessThanOrEqual(8)
    const gaps = beats.slice(1).map((b, i) => b - (beats[i] ?? 0))
    for (const gap of gaps) expect(gap).toBeCloseTo(500, -2)
  })

  it('não detecta nada em som sustentado (fluxo zero)', () => {
    expect(run(() => 0, 3).beats).toHaveLength(0)
  })

  it('ignora ruído pequeno abaixo da margem', () => {
    const rand = noise(7)
    expect(run(() => 0.0015 * rand(), 3).beats).toHaveLength(0)
  })

  it('respeita o intervalo mínimo entre batidas', () => {
    const { beats } = run(hits(100), 2) // golpes a cada 100 ms < cooldown 180 ms
    const gaps = beats.slice(1).map((b, i) => b - (beats[i] ?? 0))
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(180)
  })

  it('o impulso salta na batida e decai', () => {
    const detector = createBeatDetector()
    for (let i = 0; i < 60; i++) detector.update(0.001, FRAME)
    expect(detector.update(0.08, FRAME)).toBeGreaterThan(0)
    const peak = detector.impulse
    for (let i = 0; i < 30; i++) detector.update(0.001, FRAME)
    expect(detector.impulse).toBeLessThan(peak * 0.2)
  })
})
