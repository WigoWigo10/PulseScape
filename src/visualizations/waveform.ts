/**
 * Lógica pura da forma de onda (osciloscópio): reamostragem do timeDomain em N
 * pontos, gatilho por cruzamento de zero (estabiliza a imagem) e suavização
 * temporal dependente de deltaMs. Sem DOM nem Web Audio — testável em Node.
 */

/** Centro do byte de amostra (getByteTimeDomainData): 128 = silêncio. */
const CENTER = 128

/**
 * Índice do primeiro cruzamento ascendente de zero em [0, searchEnd).
 * Começar a janela nele mantém a onda “parada” como num osciloscópio com gatilho.
 * Retorna 0 se não houver cruzamento (silêncio ou ruído DC).
 */
export function findTrigger(timeDomain: ArrayLike<number>, searchEnd: number): number {
  const end = Math.min(searchEnd, timeDomain.length - 1)
  for (let i = 0; i < end; i++) {
    if ((timeDomain[i] ?? CENTER) < CENTER && (timeDomain[i + 1] ?? CENTER) >= CENTER) return i + 1
  }
  return 0
}

export interface WaveformTracker {
  /** Amostras suavizadas em [-1, 1]. */
  readonly samples: Float32Array
  /**
   * `timeDomain` null = sem sinal (decai para zero). `deltaMs` 0 = não altera.
   * `gain` = reforço linear da faixa (fixo por música; ver AudioFrame.waveGain).
   */
  update(timeDomain: ArrayLike<number> | null, deltaMs: number, gain?: number): void
  isIdle(): boolean
}

export function createWaveformTracker(points = 256, smoothingMs = 18): WaveformTracker {
  const samples = new Float32Array(points)

  return {
    samples,
    update(timeDomain, deltaMs, gain = 1) {
      if (deltaMs <= 0) return
      const k = 1 - Math.exp(-deltaMs / smoothingMs)

      if (!timeDomain || timeDomain.length < 4) {
        for (let i = 0; i < points; i++) samples[i] = (samples[i] ?? 0) * (1 - k)
        return
      }

      // Janela de metade do buffer, iniciando no gatilho encontrado na outra metade.
      const window = Math.floor(timeDomain.length / 2)
      const start = findTrigger(timeDomain, timeDomain.length - window)
      for (let i = 0; i < points; i++) {
        const index = start + Math.floor((i * window) / points)
        const raw = (((timeDomain[index] ?? CENTER) - CENTER) / CENTER) * gain
        const target = raw > 1 ? 1 : raw < -1 ? -1 : raw
        const current = samples[i] ?? 0
        samples[i] = current + (target - current) * k
      }
    },
    isIdle() {
      for (let i = 0; i < points; i++) if (Math.abs(samples[i] ?? 0) > 0.004) return false
      return true
    },
  }
}
