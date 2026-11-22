/**
 * Detecção de batida (ataque) por **fluxo espectral** nos graves: quanto as bandas
 * de grave subiram de um quadro para o outro. É o que se sente como “impacto” no som
 * (bumbo, caixa, viradas). Lógica pura, testável.
 *
 * Por que fluxo e não nível: em músicas masterizadas alto o nível de grave fica preso
 * numa faixa estreita (medido: ~0,42–0,65) e um bumbo o eleva só ~0,05–0,1; uma regra
 * “nível > média × 1,3” detectava ~0,1 batida/s. O fluxo fica perto de zero em som
 * sustentado e salta nos golpes (ver docs/decisions.md, D12).
 */

/** Soma das subidas (positivas) por banda entre quadros, normalizada pelo nº de bandas. */
export function bassFlux(
  levels: ArrayLike<number>,
  previous: Float32Array,
  from: number,
  to: number,
): number {
  const end = Math.min(to, levels.length, previous.length)
  if (end <= from) return 0
  let flux = 0
  for (let i = from; i < end; i++) {
    const current = levels[i] ?? 0
    const rise = current - (previous[i] ?? 0)
    if (rise > 0) flux += rise
    previous[i] = current
  }
  return flux / (end - from)
}

export interface BeatOptions {
  /** Constante de tempo da média e do desvio recentes do fluxo (ms). */
  averageMs: number
  /** Limiar = média + deviations × desvio + margin. */
  deviations: number
  margin: number
  /** Intervalo mínimo entre batidas (ms): um golpe não dispara duas vezes. */
  cooldownMs: number
  /** Decaimento do impulso após a batida (ms). */
  impulseMs: number
}

/**
 * Calibrado em 30 s de cada uma das 3 faixas de teste (simulação offline com o mesmo
 * analisador): 1,6 / 2,0 / 1,5 batidas/s, intervalos medianos de 700 / 483 / 550 ms.
 */
export const DEFAULT_BEAT_OPTIONS: BeatOptions = {
  averageMs: 400,
  deviations: 1.5,
  margin: 0.003,
  cooldownMs: 180,
  impulseMs: 220,
}

export interface BeatDetector {
  /** Impulso atual 0–1: salta na batida e decai exponencialmente. */
  readonly impulse: number
  /**
   * Quanto a última batida superou o limiar, relativo a ele (sem teto): (fluxo − limiar)
   * / limiar. Diferencia golpes de destaque de bumbos comuns, já que a força (0,4–1)
   * satura em músicas com graves fortes.
   */
  readonly lastExcess: number
  /** Retorna a força (0,4–1) da batida neste quadro, ou 0 se não houve batida. */
  update(flux: number, deltaMs: number): number
}

export function createBeatDetector(options: BeatOptions = DEFAULT_BEAT_OPTIONS): BeatDetector {
  let average = 0
  let deviation = 0
  let previous = 0
  let impulse = 0
  let lastExcess = 0
  let sinceBeat = Number.POSITIVE_INFINITY

  return {
    get impulse() {
      return impulse
    },
    get lastExcess() {
      return lastExcess
    },
    update(flux, deltaMs) {
      if (deltaMs <= 0) return 0
      sinceBeat += deltaMs
      impulse *= Math.exp(-deltaMs / options.impulseMs)

      const threshold = average + options.deviations * deviation + options.margin
      let strength = 0
      // Dispara ao cruzar o limiar para cima: um golpe = uma batida.
      if (flux > threshold && previous <= threshold && sinceBeat >= options.cooldownMs) {
        strength = Math.min(1, Math.max(0.4, 0.4 + (flux - threshold) / (3 * deviation + 0.01)))
        lastExcess = (flux - threshold) / threshold
        impulse = Math.max(impulse, strength)
        sinceBeat = 0
      }

      // Estatísticas atualizadas depois: o golpe não eleva o próprio limiar antes de ser detectado.
      const k = 1 - Math.exp(-deltaMs / options.averageMs)
      deviation += (Math.abs(flux - average) - deviation) * k
      average += (flux - average) * k
      previous = flux
      return strength
    },
  }
}
