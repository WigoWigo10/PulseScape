/**
 * Sistema de partículas com pool fixo (lógica pura, testável).
 *
 * Os dados ficam em Float32Arrays pré-alocados e compactados em [0, count): a remoção
 * troca a partícula morta pela última viva. Nada é alocado por quadro.
 * Unidades livres — no Anel, posição e velocidade são frações do tamanho do palco
 * (resistente a redimensionamento) e tempo em ms.
 */

export interface ParticleSystem {
  readonly capacity: number
  /** Partículas vivas: índices [0, count). */
  readonly count: number
  readonly x: Float32Array
  readonly y: Float32Array
  readonly vx: Float32Array
  readonly vy: Float32Array
  /** Vida restante (ms). */
  readonly life: Float32Array
  readonly maxLife: Float32Array
  /** Valor livre por partícula (no Anel: intensidade 0–1 que define a cor). */
  readonly tone: Float32Array
  /**
   * Cria uma partícula. Com o pool cheio, substitui a de menor vida restante
   * (a mais perto de sumir), para que batidas novas sempre apareçam.
   */
  emit(x: number, y: number, vx: number, vy: number, life: number, tone: number): void
  /** Move, aplica arrasto (velocidade × e^(−dt/dragMs)) e remove as que morreram. */
  update(deltaMs: number, dragMs: number): void
  clear(): void
}

export function createParticleSystem(capacity: number): ParticleSystem {
  const x = new Float32Array(capacity)
  const y = new Float32Array(capacity)
  const vx = new Float32Array(capacity)
  const vy = new Float32Array(capacity)
  const life = new Float32Array(capacity)
  const maxLife = new Float32Array(capacity)
  const tone = new Float32Array(capacity)
  let count = 0

  const write = (i: number, px: number, py: number, pvx: number, pvy: number, plife: number, ptone: number) => {
    x[i] = px
    y[i] = py
    vx[i] = pvx
    vy[i] = pvy
    life[i] = plife
    maxLife[i] = plife
    tone[i] = ptone
  }

  const copy = (from: number, to: number) => {
    x[to] = x[from] ?? 0
    y[to] = y[from] ?? 0
    vx[to] = vx[from] ?? 0
    vy[to] = vy[from] ?? 0
    life[to] = life[from] ?? 0
    maxLife[to] = maxLife[from] ?? 0
    tone[to] = tone[from] ?? 0
  }

  return {
    capacity,
    get count() {
      return count
    },
    x,
    y,
    vx,
    vy,
    life,
    maxLife,
    tone,

    emit(px, py, pvx, pvy, plife, ptone) {
      if (plife <= 0 || capacity === 0) return
      if (count < capacity) {
        write(count, px, py, pvx, pvy, plife, ptone)
        count += 1
        return
      }
      let weakest = 0
      for (let i = 1; i < count; i++) if ((life[i] ?? 0) < (life[weakest] ?? 0)) weakest = i
      write(weakest, px, py, pvx, pvy, plife, ptone)
    },

    update(deltaMs, dragMs) {
      if (deltaMs <= 0) return
      const drag = Math.exp(-deltaMs / dragMs)
      let i = 0
      while (i < count) {
        const remaining = (life[i] ?? 0) - deltaMs
        if (remaining <= 0) {
          count -= 1
          if (i !== count) copy(count, i) // a última viva ocupa o lugar; reavalia o índice i
          continue
        }
        life[i] = remaining
        const nvx = (vx[i] ?? 0) * drag
        const nvy = (vy[i] ?? 0) * drag
        vx[i] = nvx
        vy[i] = nvy
        x[i] = (x[i] ?? 0) + nvx * deltaMs
        y[i] = (y[i] ?? 0) + nvy * deltaMs
        i += 1
      }
    },

    clear() {
      count = 0
    },
  }
}
