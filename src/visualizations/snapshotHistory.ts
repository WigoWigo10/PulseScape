/**
 * Histórico de “fotografias” de níveis (ex.: bandas do espectro) capturadas a
 * intervalos fixos de **distância percorrida**. Com velocidade 1 a distância é o
 * próprio tempo (ms); no túnel a velocidade acompanha a energia da música, e a
 * “idade” de cada captura vira profundidade. Lógica pura, testável em Node.
 */

export interface SnapshotHistory {
  /** Odômetro interno: soma de deltaMs × velocidade (só avança com deltaMs > 0). */
  readonly clock: number
  /**
   * Avança o odômetro e captura `source` a cada `intervalMs` percorridos.
   * `mark` (ex.: força de uma batida) fica pendente e é gravado na próxima captura.
   */
  advance(source: ArrayLike<number>, deltaMs: number, speed?: number, mark?: number): void
  /** Visita as capturas com idade ≤ maxAgeMs, da mais antiga para a mais nova. */
  forEach(visit: (levels: Float32Array, ageMs: number, peak: number, mark: number) => void): void
  /** true se nenhuma captura viva tem nível acima de `epsilon`. */
  isSilent(epsilon?: number): boolean
}

export function createSnapshotHistory(
  size: number,
  intervalMs: number,
  maxAgeMs: number,
): SnapshotHistory {
  // Capacidade suficiente para cobrir maxAgeMs no intervalo dado.
  const capacity = Math.ceil(maxAgeMs / intervalMs) + 2
  const slots = Array.from({ length: capacity }, () => new Float32Array(size))
  const times = new Float64Array(capacity).fill(Number.NEGATIVE_INFINITY)
  const peaks = new Float32Array(capacity)
  const marks = new Float32Array(capacity)
  let pendingMark = 0
  let head = 0
  let clock = 0
  let sinceCapture = intervalMs // captura já na primeira chamada

  const alive = (index: number) => {
    const age = clock - (times[index] ?? Number.NEGATIVE_INFINITY)
    return age >= 0 && age <= maxAgeMs
  }

  return {
    get clock() {
      return clock
    },

    advance(source, deltaMs, speed = 1, mark = 0) {
      const distance = deltaMs * speed
      if (distance <= 0) return
      if (mark > pendingMark) pendingMark = mark
      clock += distance
      sinceCapture += distance
      if (sinceCapture < intervalMs) return
      // Após pausas longas não acumula capturas atrasadas.
      sinceCapture = sinceCapture >= intervalMs * 2 ? 0 : sinceCapture - intervalMs

      const slot = slots[head]
      if (!slot) return
      let peak = 0
      for (let i = 0; i < size; i++) {
        const v = source[i] ?? 0
        slot[i] = v
        if (v > peak) peak = v
      }
      times[head] = clock
      peaks[head] = peak
      marks[head] = pendingMark
      pendingMark = 0
      head = (head + 1) % capacity
    },

    forEach(visit) {
      for (let k = capacity; k >= 1; k--) {
        const index = (head - k + capacity) % capacity
        if (!alive(index)) continue
        const slot = slots[index]
        if (slot) visit(slot, clock - (times[index] ?? clock), peaks[index] ?? 0, marks[index] ?? 0)
      }
    },

    isSilent(epsilon = 0.004) {
      for (let index = 0; index < capacity; index++) {
        if (alive(index) && (peaks[index] ?? 0) > epsilon) return false
      }
      return true
    },
  }
}
