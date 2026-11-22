import { describe, expect, it } from 'vitest'
import { createSnapshotHistory } from '../visualizations/snapshotHistory'

function collect(history: ReturnType<typeof createSnapshotHistory>) {
  const out: { first: number; age: number; peak: number }[] = []
  history.forEach((levels, age, peak) => out.push({ first: levels[0] ?? 0, age, peak }))
  return out
}

describe('createSnapshotHistory', () => {
  it('captura no intervalo e visita da mais antiga para a mais nova', () => {
    const h = createSnapshotHistory(2, 50, 1000)
    h.advance([0.1, 0], 50) // captura imediata
    h.advance([0.2, 0], 50)
    h.advance([0.3, 0], 50)
    const seen = collect(h)
    expect(seen.map((s) => s.first)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ])
    expect(seen.map((s) => s.age)).toEqual([100, 50, 0])
  })

  it('não captura antes de completar o intervalo', () => {
    const h = createSnapshotHistory(1, 50, 1000)
    h.advance([1], 10)
    h.advance([1], 10)
    expect(collect(h)).toHaveLength(1)
    h.advance([1], 40)
    expect(collect(h)).toHaveLength(2)
  })

  it('descarta capturas mais velhas que maxAge', () => {
    const h = createSnapshotHistory(1, 50, 200)
    for (let i = 0; i < 20; i++) h.advance([0.5], 50)
    const ages = collect(h).map((s) => s.age)
    expect(Math.max(...ages)).toBeLessThanOrEqual(200)
    expect(ages.length).toBe(5)
  })

  it('fica em silêncio quando só restam capturas sem sinal', () => {
    const h = createSnapshotHistory(4, 50, 300)
    h.advance([0.8, 0.2, 0, 0], 50)
    expect(h.isSilent()).toBe(false)
    for (let i = 0; i < 10; i++) h.advance([0, 0, 0, 0], 50)
    expect(h.isSilent()).toBe(true)
  })

  it('velocidade maior percorre mais distância e captura mais vezes', () => {
    const slow = createSnapshotHistory(1, 50, 10_000)
    const fast = createSnapshotHistory(1, 50, 10_000)
    for (let i = 0; i < 10; i++) {
      slow.advance([1], 25, 1)
      fast.advance([1], 25, 2)
    }
    expect(fast.clock).toBe(slow.clock * 2)
    expect(collect(fast).length).toBeGreaterThan(collect(slow).length)
    // Espaçamento entre anéis (em distância) é o mesmo nas duas velocidades.
    const gaps = (h: ReturnType<typeof createSnapshotHistory>) => {
      const ages = collect(h).map((s) => s.age)
      return ages.slice(1).map((a, i) => (ages[i] ?? 0) - a)
    }
    expect(new Set(gaps(fast))).toEqual(new Set([50]))
  })

  it('grava a marca (batida) na próxima captura e só nela', () => {
    const h = createSnapshotHistory(1, 50, 10_000)
    h.advance([1], 50) // captura sem marca
    h.advance([1], 20, 1, 0.8) // batida entre capturas: fica pendente
    h.advance([1], 30) // completa o intervalo → captura marcada
    h.advance([1], 50) // próxima captura volta a 0
    const marks: number[] = []
    h.forEach((_levels, _age, _peak, mark) => marks.push(mark))
    expect(marks).toEqual([0, expect.closeTo(0.8, 5), 0])
  })

  it('deltaMs zero não altera nada', () => {
    const h = createSnapshotHistory(1, 50, 1000)
    h.advance([1], 0)
    expect(h.clock).toBe(0)
    expect(collect(h)).toHaveLength(0)
  })

  it('não acumula capturas atrasadas depois de um salto grande', () => {
    const h = createSnapshotHistory(1, 50, 10_000)
    h.advance([1], 50)
    h.advance([1], 5000)
    expect(collect(h)).toHaveLength(2)
  })
})
