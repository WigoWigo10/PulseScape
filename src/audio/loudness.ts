/**
 * Medição de volume da faixa inteira (lógica pura, sem Web Audio).
 *
 * O ganho de visualização é decidido **uma vez por faixa**: músicas baixas como um
 * todo recebem um reforço fixo; trechos baixos de uma música normal não são alterados
 * (ver docs/decisions.md, D9).
 */

/** Volume (dBFS RMS) dos trechos fortes a partir do qual nenhum reforço é aplicado. */
export const REFERENCE_LOUD_DB = -14
export const MAX_TRACK_BOOST_DB = 18
/** Janelas abaixo disto são tratadas como silêncio e ignoradas na estatística. */
const SILENCE_DB = -60

/**
 * Volume dos trechos fortes da faixa: percentil 90 do RMS (dBFS) em janelas de
 * `windowMs`, ignorando silêncio. Usa a média de energia entre os canais.
 * Retorna null se a faixa for toda silêncio.
 */
export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  windowMs = 400,
  percentile = 0.9,
): number | null {
  const first = channels[0]
  if (!first || first.length === 0) return null
  const length = first.length
  const window = Math.max(1, Math.round((sampleRate * windowMs) / 1000))
  const levels: number[] = []

  for (let start = 0; start + window <= length; start += window) {
    let energy = 0
    for (const channel of channels) {
      for (let i = start; i < start + window; i++) {
        const x = channel[i] ?? 0
        energy += x * x
      }
    }
    const meanSquare = energy / (window * channels.length)
    if (meanSquare <= 0) continue
    const db = 10 * Math.log10(meanSquare)
    if (db > SILENCE_DB) levels.push(db)
  }

  if (levels.length === 0) return null
  levels.sort((a, b) => a - b)
  const index = Math.min(levels.length - 1, Math.floor(percentile * (levels.length - 1)))
  return levels[index] ?? null
}

/** Reforço (dB, ≥ 0) para a faixa inteira; arredondado a 0,5 dB. */
export function trackGainDb(
  loudDb: number | null,
  referenceDb = REFERENCE_LOUD_DB,
  maxBoostDb = MAX_TRACK_BOOST_DB,
): number {
  if (loudDb === null || !Number.isFinite(loudDb)) return 0
  const boost = Math.min(Math.max(referenceDb - loudDb, 0), maxBoostDb)
  return Math.round(boost * 2) / 2
}
