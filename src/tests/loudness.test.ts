import { describe, expect, it } from 'vitest'
import { MAX_TRACK_BOOST_DB, measureLoudness, REFERENCE_LOUD_DB, trackGainDb } from '../audio/loudness'

const RATE = 8000

function tone(seconds: number, amplitude: number, freq = 220): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / RATE)
  return out
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

describe('measureLoudness', () => {
  it('mede o RMS em dBFS de um tom constante', () => {
    const amplitude = 0.5 // RMS = 0,5/√2 → ≈ −9,03 dBFS
    const db = measureLoudness([tone(4, amplitude)], RATE)!
    expect(db).toBeCloseTo(20 * Math.log10(amplitude / Math.SQRT2), 1)
  })

  it('reflete os trechos fortes, não a média com trechos baixos', () => {
    // 80% baixo (−40 dB) + 20% forte (−9 dB): o percentil 90 fica no trecho forte.
    const signal = concat(tone(8, 0.014), tone(2, 0.5))
    const db = measureLoudness([signal], RATE)!
    expect(db).toBeGreaterThan(-12)
  })

  it('ignora silêncio e retorna null para faixa silenciosa', () => {
    expect(measureLoudness([new Float32Array(RATE * 2)], RATE)).toBeNull()
    const withSilence = concat(new Float32Array(RATE * 6), tone(2, 0.5))
    expect(measureLoudness([withSilence], RATE)!).toBeGreaterThan(-12)
  })

  it('considera todos os canais', () => {
    const left = tone(2, 0.5)
    const right = new Float32Array(left.length)
    const stereo = measureLoudness([left, right], RATE)!
    const mono = measureLoudness([left], RATE)!
    expect(stereo).toBeCloseTo(mono - 3.01, 1) // metade da energia
  })
})

describe('trackGainDb', () => {
  it('não reforça faixas no volume de referência ou acima', () => {
    expect(trackGainDb(REFERENCE_LOUD_DB)).toBe(0)
    expect(trackGainDb(-6)).toBe(0)
  })

  it('reforça faixas baixas pela diferença, até o limite', () => {
    expect(trackGainDb(REFERENCE_LOUD_DB - 6)).toBe(6)
    expect(trackGainDb(-80)).toBe(MAX_TRACK_BOOST_DB)
  })

  it('arredonda a 0,5 dB e trata ausência de medida como 0', () => {
    expect(trackGainDb(REFERENCE_LOUD_DB - 6.3)).toBe(6.5)
    expect(trackGainDb(null)).toBe(0)
  })
})
