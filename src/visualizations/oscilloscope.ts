import type { PresetOptions } from './spectrum'
import type { Visualization2D } from './types'
import { averageLevel, createBandTracker, ENVELOPE_MOTION, ENVELOPE_REDUCED_MOTION } from './spectrumBands'
import { createWaveformTracker } from './waveform'

const POINTS = 512
/**
 * Cópias anteriores desenhadas como rastro de fósforo. O gargalo deste preset é a
 * rasterização na GPU de traços longos e sinuosos (o JS gasta < 0,5 ms/quadro):
 * 7 cópias de 512 pontos com junções arredondadas davam ~40 FPS; 5 cópias com
 * metade dos pontos e junções chanfradas, ~80 FPS (medido, DPR 2, ver D10).
 */
const TRAIL_LENGTH = 5
/** O rastro é tênue: metade dos pontos basta e reduz o custo de rasterização. */
const TRAIL_STEP = 2
/** Intervalo entre cópias do rastro (ms), independente da taxa de quadros. */
const TRAIL_INTERVAL_MS = 30
/** Bandas de graves (~40–130 Hz) com 32 bandas de 30 Hz a 16 kHz. */
const BASS_FROM = 1
const BASS_TO = 7

/**
 * Osciloscópio: forma de onda em tela cheia com gatilho (imagem estável), rastro
 * de fósforo, cor por intensidade (ciano no centro, rosa nos extremos) e uma
 * faixa de brilho que respira com os graves.
 */
export function createOscilloscope({ reducedMotion = false }: PresetOptions = {}): Visualization2D {
  const wave = createWaveformTracker(POINTS, reducedMotion ? 50 : 10)
  const bands = createBandTracker(32, reducedMotion ? ENVELOPE_REDUCED_MOTION : ENVELOPE_MOTION)
  const trailLength = reducedMotion ? 0 : TRAIL_LENGTH
  const trail = Array.from({ length: trailLength }, () => new Float32Array(POINTS))
  let trailHead = 0
  let trailFilled = 0
  let trailClock = 0

  let width = 0
  let height = 0

  const tracePath = (
    ctx: CanvasRenderingContext2D,
    samples: Float32Array,
    left: number,
    span: number,
    mid: number,
    amp: number,
    step = 1,
  ) => {
    const taperSpan = POINTS * 0.04
    ctx.beginPath()
    for (let i = 0; i < POINTS; i += step) {
      const taper = Math.min(1, Math.min(i, POINTS - 1 - i) / taperSpan)
      const x = left + (i / (POINTS - 1)) * span
      const y = mid - (samples[i] ?? 0) * amp * taper
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  }

  const trailIsSilent = () => {
    for (const copy of trail) for (let i = 0; i < POINTS; i++) if (Math.abs(copy[i] ?? 0) > 0.004) return false
    return true
  }

  return {
    id: 'oscilloscope',
    kind: '2d',
    label: 'Onda',

    resize(w, h) {
      width = w
      height = h
    },

    render(ctx, frame, deltaMs) {
      bands.update(frame, deltaMs)
      wave.update(frame ? frame.timeDomain : null, deltaMs, frame ? frame.waveGain : 1)

      if (deltaMs > 0 && trailLength > 0) {
        trailClock += deltaMs
        if (trailClock >= TRAIL_INTERVAL_MS) {
          trailClock = 0
          trail[trailHead]?.set(wave.samples)
          trailHead = (trailHead + 1) % trailLength
          trailFilled = Math.min(trailFilled + 1, trailLength)
        }
      }

      ctx.clearRect(0, 0, width, height)
      if (width <= 0 || height <= 0) return

      const pad = Math.max(16, width * 0.04)
      const span = width - pad * 2
      const mid = height / 2
      const amp = height * 0.36
      const bass = averageLevel(bands.envelope.levels, BASS_FROM, BASS_TO)

      // Faixa de brilho dos graves ao redor da linha central.
      const glowHeight = amp * (0.5 + 0.6 * bass)
      const glow = ctx.createLinearGradient(0, mid - glowHeight, 0, mid + glowHeight)
      glow.addColorStop(0, 'rgba(124, 92, 255, 0)')
      glow.addColorStop(0.5, `rgba(124, 92, 255, ${0.04 + 0.16 * bass})`)
      glow.addColorStop(1, 'rgba(124, 92, 255, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, mid - glowHeight, width, glowHeight * 2)

      // Retícula discreta de osciloscópio.
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.08)'
      ctx.beginPath()
      for (let k = 1; k < 10; k++) {
        const x = Math.round(pad + (span * k) / 10) + 0.5
        ctx.moveTo(x, mid - amp)
        ctx.lineTo(x, mid + amp)
      }
      for (const f of [-1, -0.5, 0.5, 1]) {
        const y = Math.round(mid + amp * f) + 0.5
        ctx.moveTo(pad, y)
        ctx.lineTo(pad + span, y)
      }
      ctx.stroke()
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.25)'
      ctx.beginPath()
      ctx.moveTo(pad, Math.round(mid) + 0.5)
      ctx.lineTo(pad + span, Math.round(mid) + 0.5)
      ctx.stroke()

      // Cor por intensidade: depende da distância da linha central.
      const intensity = ctx.createLinearGradient(0, mid - amp, 0, mid + amp)
      intensity.addColorStop(0, '#ff5ca8')
      intensity.addColorStop(0.3, '#7c5cff')
      intensity.addColorStop(0.5, '#22d3ee')
      intensity.addColorStop(0.7, '#7c5cff')
      intensity.addColorStop(1, '#ff5ca8')

      ctx.lineJoin = 'bevel'
      ctx.lineCap = 'butt'

      // Rastro de fósforo: da cópia mais antiga para a mais recente (mistura normal,
      // menos pontos — é o trecho mais caro do preset).
      ctx.strokeStyle = intensity
      ctx.lineWidth = 1.3
      for (let age = trailFilled; age >= 1; age--) {
        const copy = trail[(trailHead - age + trailLength) % trailLength]
        if (!copy) continue
        ctx.globalAlpha = 0.3 * (1 - age / (trailLength + 1))
        tracePath(ctx, copy, pad, span, mid, amp, TRAIL_STEP)
        ctx.stroke()
      }

      // Traço principal com brilho aditivo.
      ctx.globalCompositeOperation = 'lighter'
      tracePath(ctx, wave.samples, pad, span, mid, amp)
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.22)'
      ctx.lineWidth = 6
      ctx.stroke()
      ctx.strokeStyle = intensity
      ctx.lineWidth = 2.2
      ctx.stroke()

      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    },

    isIdle: () => wave.isIdle() && bands.isIdle() && trailIsSilent(),

    dispose() {},
  }
}
