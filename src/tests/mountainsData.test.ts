import { describe, expect, it } from 'vitest'
import {
  buildGridVertices,
  buildLineIndices,
  buildSurfaceIndices,
  fillMirroredRow,
} from '../visualizations/mountainsData'

describe('fillMirroredRow', () => {
  it('espelha o espectro com os graves no centro e agudos nas bordas', () => {
    const levels = [1, 0.5, 0.25, 0] // banda 0 = grave
    const out = new Uint8Array(8)
    const peak = fillMirroredRow(levels, 4, out)
    expect([...out]).toEqual([0, 64, 128, 255, 255, 128, 64, 0])
    expect(peak).toBe(1)
  })

  it('limita valores a 0–1', () => {
    const out = new Uint8Array(4)
    fillMirroredRow([2, -1], 2, out)
    expect([...out]).toEqual([0, 255, 255, 0])
  })
})

describe('grade', () => {
  const cols = 6
  const rows = 4

  it('vértices guardam (col, row) na ordem row × cols + col', () => {
    const v = buildGridVertices(cols, rows)
    expect(v.length).toBe(cols * rows * 2)
    const i = 2 * cols + 3
    expect([v[i * 2], v[i * 2 + 1]]).toEqual([3, 2])
  })

  it('superfície: dois triângulos por célula, índices válidos', () => {
    const idx = buildSurfaceIndices(cols, rows)
    expect(idx.length).toBe((cols - 1) * (rows - 1) * 6)
    expect(Math.max(...idx)).toBe(cols * rows - 1)
  })

  it('linhas: todas as transversais e longitudinais a cada colStep', () => {
    const idx = buildLineIndices(cols, rows, 2)
    expect(idx.length).toBe(rows * (cols - 1) * 2 + 3 * (rows - 1) * 2)
    expect(Math.max(...idx)).toBeLessThan(cols * rows)
    // Cada segmento liga vértices vizinhos (mesma linha ou mesma coluna).
    for (let k = 0; k < idx.length; k += 2) {
      const a = idx[k] ?? 0
      const b = idx[k + 1] ?? 0
      expect(b - a === 1 || b - a === cols).toBe(true)
    }
  })

  it('cabe em índices de 16 bits no tamanho usado pelo preset', () => {
    expect(128 * 72).toBeLessThan(65536)
  })
})
