import type { Visualization2D } from './types'
import { createBandTracker, ENVELOPE_MOTION, ENVELOPE_REDUCED_MOTION } from './spectrumBands'
import { createWaveformTracker } from './waveform'

const WAVE_POINTS = 192

export interface PresetOptions {
  bandCount?: number
  /** prefers-reduced-motion: movimento mais lento e sem elementos saltitantes. */
  reducedMotion?: boolean
}

/** Espectro de frequências em barras com escala logarítmica, reflexo e marcadores de pico. */
export function createSpectrum({ bandCount = 64, reducedMotion = false }: PresetOptions = {}): Visualization2D {
  const tracker = createBandTracker(bandCount, reducedMotion ? ENVELOPE_REDUCED_MOTION : ENVELOPE_MOTION)
  const { levels, peaks } = tracker.envelope
  const wave = createWaveformTracker(WAVE_POINTS, reducedMotion ? 60 : 18)

  let width = 0
  let height = 0
  let barGradient: CanvasGradient | null = null
  let reflectionGradient: CanvasGradient | null = null

  return {
    id: 'spectrum',
    kind: '2d',
    label: 'Barras',

    resize(w, h) {
      width = w
      height = h
      barGradient = null
      reflectionGradient = null
    },

    render(ctx, frame, deltaMs) {
      tracker.update(frame, deltaMs)
      wave.update(frame ? frame.timeDomain : null, deltaMs, frame ? frame.waveGain : 1)

      ctx.clearRect(0, 0, width, height)
      if (width <= 0 || height <= 0) return

      const baseline = Math.round(height * 0.78)
      const maxBar = baseline - height * 0.08
      const pad = Math.max(16, width * 0.04)

      // Forma de onda flutuando acima das barras (desenhada atrás delas).
      const waveY = height * 0.2
      const waveAmp = height * (reducedMotion ? 0.06 : 0.11)
      const waveWidth = width - pad * 2
      const taperSpan = WAVE_POINTS * 0.08 // suaviza as pontas
      ctx.beginPath()
      for (let i = 0; i < WAVE_POINTS; i++) {
        const taper = Math.min(1, Math.min(i, WAVE_POINTS - 1 - i) / taperSpan)
        const x = pad + (i / (WAVE_POINTS - 1)) * waveWidth
        const y = waveY - (wave.samples[i] ?? 0) * waveAmp * taper
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.2)'
      ctx.lineWidth = 7
      ctx.stroke()
      const waveGradient = ctx.createLinearGradient(pad, 0, width - pad, 0)
      waveGradient.addColorStop(0, 'rgba(255, 92, 168, 0.85)')
      waveGradient.addColorStop(0.5, 'rgba(167, 139, 250, 0.9)')
      waveGradient.addColorStop(1, 'rgba(34, 211, 238, 0.85)')
      ctx.strokeStyle = waveGradient
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      const slot = (width - pad * 2) / bandCount
      const gap = Math.max(1, slot * 0.24)
      const barWidth = Math.max(1, slot - gap)
      const radius = Math.min(barWidth / 2, 3)

      if (!barGradient || !reflectionGradient) {
        barGradient = ctx.createLinearGradient(0, baseline, 0, baseline - maxBar)
        barGradient.addColorStop(0, '#22d3ee')
        barGradient.addColorStop(0.55, '#7c5cff')
        barGradient.addColorStop(1, '#ff5ca8')
        reflectionGradient = ctx.createLinearGradient(0, baseline, 0, height)
        reflectionGradient.addColorStop(0, 'rgba(34, 211, 238, 0.28)')
        reflectionGradient.addColorStop(1, 'rgba(34, 211, 238, 0)')
      }

      // Barras (um único path para todas).
      ctx.fillStyle = barGradient
      ctx.beginPath()
      for (let i = 0; i < bandCount; i++) {
        const h = Math.max(2, (levels[i] ?? 0) * maxBar)
        ctx.roundRect(pad + i * slot + gap / 2, baseline - h, barWidth, h, [radius, radius, 0, 0])
      }
      ctx.fill()

      // Reflexo.
      ctx.fillStyle = reflectionGradient
      ctx.beginPath()
      for (let i = 0; i < bandCount; i++) {
        const h = (levels[i] ?? 0) * maxBar * 0.35
        if (h > 0.5) ctx.rect(pad + i * slot + gap / 2, baseline + 3, barWidth, h)
      }
      ctx.fill()

      // Marcadores de pico.
      if (!reducedMotion) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        ctx.beginPath()
        for (let i = 0; i < bandCount; i++) {
          const peak = peaks[i] ?? 0
          if (peak > 0.01) ctx.rect(pad + i * slot + gap / 2, baseline - peak * maxBar - 4, barWidth, 2)
        }
        ctx.fill()
      }

      // Linha de base.
      ctx.fillStyle = 'rgba(124, 92, 255, 0.35)'
      ctx.fillRect(pad, baseline + 1, width - pad * 2, 1)
    },

    isIdle: () => tracker.isIdle() && wave.isIdle(),

    dispose() {
      barGradient = null
      reflectionGradient = null
    },
  }
}
