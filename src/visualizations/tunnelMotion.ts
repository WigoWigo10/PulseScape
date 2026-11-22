/**
 * Velocidade do voo no Túnel (lógica pura, testável).
 *
 * Requisito do responsável: a velocidade **não** deve ser constante — o túnel deve
 * acelerar nos pontos/batidas fortes da música. Dois componentes, somados à base:
 * - **Embalo por batida de destaque**: “forte” é **relativo à própria música** — o
 *   golpe precisa superar o excesso típico das últimas ~7 batidas. Medido: com força
 *   absoluta, 77–110 de cada ~90–115 batidas contavam como fortes nas faixas de teste
 *   e o túnel ficava rápido 90–95% do tempo (constante de novo, só que alto).
 * - **Trecho forte**: energia recente (~0,8 s) acima da média longa (~8 s) da própria
 *   música acelera — relativo, funciona em músicas comprimidas.
 * A velocidade real persegue o alvo com rampa (sobe rápido, desce devagar).
 */

export interface MotionOptions {
  base: number
  /** Ganho do embalo das batidas na velocidade-alvo. */
  momentumGain: number
  /** Decaimento do embalo (ms). */
  momentumDecayMs: number
  /** Embalo máximo acumulado. */
  momentumMax: number
  /** Peso das batidas recentes na estatística de excesso típico (0–1, por batida). */
  beatStatsRate: number
  /** Quantos desvios acima do excesso típico um golpe precisa para peso cheio. */
  standoutDeviations: number
  /**
   * Piso relativo: peso cheio exige superar o típico em pelo menos esta fração dele.
   * Sem o piso, bumbos quase idênticos (desvio ~0) viravam “destaques” por diferenças mínimas.
   */
  standoutMinRatio: number
  /** Ganho do trecho forte na velocidade-alvo. */
  sectionGain: number
  /** Quanto a energia recente precisa superar a média longa para o trecho contar inteiro. */
  sectionRange: number
  shortMs: number
  longMs: number
  riseMs: number
  fallMs: number
}

export const DEFAULT_MOTION: MotionOptions = {
  base: 0.22,
  momentumGain: 1.6,
  momentumDecayMs: 450,
  momentumMax: 1.5,
  beatStatsRate: 0.15,
  standoutDeviations: 1.5,
  standoutMinRatio: 0.5,
  sectionGain: 0.6,
  // Medido: 0,06 / 800 ms reagia a oscilações comuns (trecho “forte” 39% do tempo).
  sectionRange: 0.18,
  shortMs: 2000,
  longMs: 8000,
  riseMs: 150,
  fallMs: 350,
}

export interface TunnelMotion {
  /** Velocidade atual (unidades de distância por ms). */
  readonly speed: number
  readonly momentum: number
  /** 0–1: quanto o trecho atual está acima da média recente da música. */
  readonly section: number
  /**
   * `beatExcess` = excesso da batida neste quadro sobre o limiar (BeatDetector.lastExcess),
   * ou `null` se não houve batida.
   */
  update(beatExcess: number | null, energy: number, deltaMs: number): number
}

/**
 * Peso de uma batida no embalo, relativo às batidas recentes: 0 até o excesso típico,
 * curva acentuada até 1 em `typical + max(standoutDeviations × desvio, minRatio × típico)`.
 */
export function standoutWeight(
  excess: number,
  typical: number,
  deviation: number,
  standoutDeviations: number,
  minRatio: number,
): number {
  const span = Math.max(standoutDeviations * deviation, minRatio * Math.max(typical, 0.2), 1e-3)
  const x = Math.min(1, Math.max(0, (excess - typical) / span))
  return x ** 1.5
}

export function createTunnelMotion(options: MotionOptions = DEFAULT_MOTION): TunnelMotion {
  let speed = options.base
  let momentum = 0
  let section = 0
  let shortEnergy = 0
  let longEnergy = 0
  let energyPrimed = false
  let typicalExcess = 0
  let excessDeviation = 0
  let beatsSeen = 0

  return {
    get speed() {
      return speed
    },
    get momentum() {
      return momentum
    },
    get section() {
      return section
    },
    update(beatExcess, energy, deltaMs) {
      if (deltaMs <= 0) return speed

      // Médias de energia: começam no primeiro valor para não “acelerar” na entrada.
      if (!energyPrimed) {
        shortEnergy = energy
        longEnergy = energy
        energyPrimed = true
      }
      shortEnergy += (energy - shortEnergy) * (1 - Math.exp(-deltaMs / options.shortMs))
      longEnergy += (energy - longEnergy) * (1 - Math.exp(-deltaMs / options.longMs))
      section = Math.min(1, Math.max(0, (shortEnergy - longEnergy) / options.sectionRange))

      momentum *= Math.exp(-deltaMs / options.momentumDecayMs)
      if (beatExcess !== null) {
        // Primeiras batidas só alimentam a estatística (ainda não há “típico”).
        if (beatsSeen >= 3) {
          const weight = standoutWeight(
            beatExcess,
            typicalExcess,
            excessDeviation,
            options.standoutDeviations,
            options.standoutMinRatio,
          )
          momentum = Math.min(options.momentumMax, momentum + weight)
        }
        if (beatsSeen === 0) typicalExcess = beatExcess
        const rate = options.beatStatsRate
        excessDeviation += (Math.abs(beatExcess - typicalExcess) - excessDeviation) * rate
        typicalExcess += (beatExcess - typicalExcess) * rate
        beatsSeen += 1
      }

      const target = options.base + options.momentumGain * momentum + options.sectionGain * section
      const tau = target > speed ? options.riseMs : options.fallMs
      speed += (target - speed) * (1 - Math.exp(-deltaMs / tau))
      return speed
    },
  }
}
