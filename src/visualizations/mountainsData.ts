/**
 * Dados da malha do preset Montanhas (lógica pura, testável): linhas de altura
 * espelhadas, vértices da grade e índices de triângulos/linhas.
 *
 * Convenção da grade: vértice i = row × cols + col, com atributos (col, row).
 * Linha 0 = fatia mais recente do espectro (frente).
 */

/**
 * Escreve uma linha de alturas (0–255) com o espectro espelhado: graves no centro,
 * agudos nas bordas — as “montanhas” se formam no meio. `out.length` = 2 × bands.
 */
export function fillMirroredRow(levels: ArrayLike<number>, bands: number, out: Uint8Array): number {
  let peak = 0
  for (let col = 0; col < bands * 2; col++) {
    const band = col < bands ? bands - 1 - col : col - bands
    const level = Math.min(1, Math.max(0, levels[band] ?? 0))
    if (level > peak) peak = level
    out[col] = Math.round(level * 255)
  }
  return peak
}

/** Pares (col, row) por vértice, em float (lidos pelo vertex shader). */
export function buildGridVertices(cols: number, rows: number): Float32Array {
  const out = new Float32Array(cols * rows * 2)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col
      out[i * 2] = col
      out[i * 2 + 1] = row
    }
  }
  return out
}

/** Dois triângulos por célula: a superfície escura que esconde as linhas de trás. */
export function buildSurfaceIndices(cols: number, rows: number): Uint16Array {
  const out = new Uint16Array((cols - 1) * (rows - 1) * 6)
  let k = 0
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      out[k++] = a
      out[k++] = c
      out[k++] = b
      out[k++] = b
      out[k++] = c
      out[k++] = d
    }
  }
  return out
}

/**
 * Linhas da grade (wireframe): todas as linhas transversais (cada fatia do espectro)
 * e as longitudinais a cada `colStep` colunas.
 */
export function buildLineIndices(cols: number, rows: number, colStep: number): Uint16Array {
  const longitudinal = Math.ceil(cols / colStep)
  const out = new Uint16Array(rows * (cols - 1) * 2 + longitudinal * (rows - 1) * 2)
  let k = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      out[k++] = row * cols + col
      out[k++] = row * cols + col + 1
    }
  }
  for (let col = 0; col < cols; col += colStep) {
    for (let row = 0; row < rows - 1; row++) {
      out[k++] = row * cols + col
      out[k++] = (row + 1) * cols + col
    }
  }
  return out
}
