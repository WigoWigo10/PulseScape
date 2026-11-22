/**
 * Lógica pura do espectro: agrupamento logarítmico de bins em bandas, envelope
 * temporal (ataque/liberação dependentes de deltaMs) e marcadores de pico.
 * Sem DOM nem Web Audio — testável em Node.
 */

export interface BandLayout {
  readonly count: number
  /** Primeiro e último bin (inclusive) de cada banda. */
  readonly lo: Int32Array
  readonly hi: Int32Array
  /** Centro da banda em bins (fracionário), para interpolar bandas mais estreitas que um bin. */
  readonly centerBin: Float32Array
  /** Distância em oitavas até 1 kHz, usada na compensação de inclinação espectral. */
  readonly octaveFrom1k: Float32Array
}

export function createBandLayout(
  count: number,
  sampleRate: number,
  fftSize: number,
  minHz = 30,
  maxHz = 16000,
): BandLayout {
  const binCount = fftSize / 2
  const binHz = sampleRate / fftSize
  const top = Math.min(maxHz, (sampleRate / 2) * 0.95)
  const ratio = top / minHz

  const lo = new Int32Array(count)
  const hi = new Int32Array(count)
  const centerBin = new Float32Array(count)
  const octaveFrom1k = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const fLo = minHz * ratio ** (i / count)
    const fHi = minHz * ratio ** ((i + 1) / count)
    const fCenter = Math.sqrt(fLo * fHi)
    const first = clamp(Math.round(fLo / binHz), 1, binCount - 1) // ignora o bin DC
    lo[i] = first
    hi[i] = clamp(Math.round(fHi / binHz) - 1, first, binCount - 1)
    centerBin[i] = fCenter / binHz
    octaveFrom1k[i] = Math.log2(fCenter / 1000)
  }

  return { count, lo, hi, centerBin, octaveFrom1k }
}

export interface LevelOptions {
  /** Ganho relativo por oitava acima de 1 kHz (0,05 = +5%/oitava) para compensar a queda natural dos agudos. */
  tiltPerOctave: number
  /** Expoente da curva de resposta: > 1 dá contraste e evita barras sempre altas. */
  gamma: number
}

export const DEFAULT_LEVEL_OPTIONS: LevelOptions = { tiltPerOctave: 0.05, gamma: 1.6 }

/** Converte magnitudes do analisador (0–255) em níveis 0–1 por banda, escrevendo em `out`. */
export function computeBandLevels(
  frequency: ArrayLike<number>,
  layout: BandLayout,
  out: Float32Array,
  options: LevelOptions = DEFAULT_LEVEL_OPTIONS,
): void {
  for (let i = 0; i < layout.count; i++) {
    const first = layout.lo[i] ?? 0
    const last = layout.hi[i] ?? first
    let raw: number

    if (last <= first) {
      // Banda mais estreita que um bin: interpola no centro para evitar degraus nos graves.
      const pos = layout.centerBin[i] ?? first
      const i0 = Math.floor(pos)
      const a = frequency[i0] ?? 0
      const b = frequency[i0 + 1] ?? a
      raw = a + (b - a) * (pos - i0)
    } else {
      raw = 0
      for (let bin = first; bin <= last; bin++) {
        const v = frequency[bin] ?? 0
        if (v > raw) raw = v
      }
    }

    // Compensação multiplicativa: silêncio continua zero (aditiva acenderia os agudos
    // em silêncio e impediria o loop de parar).
    const tilt = Math.max(0, 1 + options.tiltPerOctave * (layout.octaveFrom1k[i] ?? 0))
    out[i] = clamp((raw / 255) * tilt, 0, 1) ** options.gamma
  }
}

export interface Envelope {
  readonly levels: Float32Array
  readonly peaks: Float32Array
  /** Tempo (ms) desde que cada pico foi atingido. */
  readonly peakAge: Float32Array
}

export interface EnvelopeOptions {
  attackMs: number
  releaseMs: number
  peakHoldMs: number
  /** Velocidade de queda do pico após o hold, em unidades 0–1 por segundo. */
  peakFallPerSec: number
}

export function createEnvelope(count: number): Envelope {
  return {
    levels: new Float32Array(count),
    peaks: new Float32Array(count),
    peakAge: new Float32Array(count),
  }
}

/** Aproxima `env.levels` de `target` com constantes de tempo independentes da taxa de quadros. */
export function updateEnvelope(
  env: Envelope,
  target: ArrayLike<number>,
  deltaMs: number,
  options: EnvelopeOptions,
): void {
  if (deltaMs <= 0) return
  const attack = 1 - Math.exp(-deltaMs / options.attackMs)
  const release = 1 - Math.exp(-deltaMs / options.releaseMs)
  const fall = (options.peakFallPerSec * deltaMs) / 1000

  for (let i = 0; i < env.levels.length; i++) {
    const current = env.levels[i] ?? 0
    const goal = target[i] ?? 0
    const level = current + (goal - current) * (goal > current ? attack : release)
    env.levels[i] = level

    const peak = env.peaks[i] ?? 0
    if (level >= peak) {
      env.peaks[i] = level
      env.peakAge[i] = 0
    } else {
      const age = (env.peakAge[i] ?? 0) + deltaMs
      env.peakAge[i] = age
      if (age > options.peakHoldMs) env.peaks[i] = Math.max(level, peak - fall)
    }
  }
}

export function isEnvelopeSilent(env: Envelope, epsilon = 0.004): boolean {
  for (let i = 0; i < env.levels.length; i++) {
    if ((env.levels[i] ?? 0) > epsilon || (env.peaks[i] ?? 0) > epsilon) return false
  }
  return true
}

/** Envelopes prontos para presets: normal e prefers-reduced-motion. */
export const ENVELOPE_MOTION: EnvelopeOptions = { attackMs: 35, releaseMs: 220, peakHoldMs: 380, peakFallPerSec: 0.55 }
export const ENVELOPE_REDUCED_MOTION: EnvelopeOptions = {
  attackMs: 160,
  releaseMs: 480,
  peakHoldMs: 0,
  peakFallPerSec: 0.35,
}

/** Subconjunto do AudioFrame necessário para as bandas. */
export interface FrequencyFrame {
  readonly frequency: ArrayLike<number>
  readonly sampleRate: number
  readonly fftSize: number
}

export interface BandTracker {
  readonly count: number
  readonly envelope: Envelope
  /** Avança o envelope. `frame` null = sem sinal (decai). `deltaMs` 0 = não altera. */
  update(frame: FrequencyFrame | null, deltaMs: number): void
  isIdle(): boolean
}

/**
 * Bandas logarítmicas + envelope reutilizáveis por qualquer preset baseado em espectro.
 * O layout é recriado apenas quando sampleRate/fftSize mudam.
 */
export function createBandTracker(
  count: number,
  envelopeOptions: EnvelopeOptions,
  levelOptions: LevelOptions = DEFAULT_LEVEL_OPTIONS,
): BandTracker {
  const target = new Float32Array(count)
  const envelope = createEnvelope(count)
  let layout: BandLayout | null = null
  let layoutKey = ''

  return {
    count,
    envelope,
    update(frame, deltaMs) {
      if (deltaMs <= 0) return
      if (frame) {
        const key = `${frame.sampleRate}:${frame.fftSize}`
        if (!layout || key !== layoutKey) {
          layout = createBandLayout(count, frame.sampleRate, frame.fftSize)
          layoutKey = key
        }
        computeBandLevels(frame.frequency, layout, target, levelOptions)
      } else {
        target.fill(0)
      }
      updateEnvelope(envelope, target, deltaMs, envelopeOptions)
    },
    isIdle: () => isEnvelopeSilent(envelope),
  }
}

/** Média dos níveis no intervalo [from, to) — ex.: energia de graves para pulsar. */
export function averageLevel(levels: ArrayLike<number>, from: number, to: number): number {
  const end = Math.min(to, levels.length)
  if (end <= from) return 0
  let sum = 0
  for (let i = from; i < end; i++) sum += levels[i] ?? 0
  return sum / (end - from)
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
