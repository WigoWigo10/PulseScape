import { bassFlux, createBeatDetector } from './beatDetector'
import { createParticleSystem } from './particles'
import type { PresetOptions } from './spectrum'
import type { Visualization2D } from './types'
import { averageLevel, createBandTracker, ENVELOPE_MOTION, ENVELOPE_REDUCED_MOTION } from './spectrumBands'
import { createWaveformTracker } from './waveform'

const WAVE_POINTS = 256

/** Faíscas: pool, física (unidades = fração do tamanho do palco, tempo em ms) e aparência. */
const SPARK_CAPACITY = 700
const SPARK_DRAG_MS = 480
const SPARK_LIFE_MIN_MS = 500
const SPARK_LIFE_RANGE_MS = 600
/** Faíscas por batida = base + força × extra (força 0,4–1 → ~38–68). */
const SPARK_COUNT_BASE = 18
const SPARK_COUNT_STRENGTH = 50
const SPARK_SPEED_MIN = 0.00035
const SPARK_SPEED_RANGE = 0.0006
/** Comprimento do risco = deslocamento em N ms: risco encolhe conforme a faísca freia. */
const SPARK_STREAK_MS = 28
/** Cor pela intensidade da barra de origem (mesma paleta do anel). */
const SPARK_COLORS = ['#22d3ee', '#a78bfa', '#ff5ca8'] as const
const SPARK_ALPHAS = [0.35, 0.65, 1] as const
/** Bandas do fluxo de batida (~35–140 Hz), como no Túnel (D12). */
const FLUX_FROM = 2
const FLUX_TO = 16

const TAU = Math.PI * 2
/** Bandas usadas como "graves" para o pulso (~40–130 Hz com 64 bandas de 30 Hz a 16 kHz). */
const BASS_FROM = 3
const BASS_TO = 15

/**
 * Espectro radial: bandas espelhadas ao redor de um círculo (graves no topo,
 * agudos se encontrando embaixo). O raio pulsa com os graves e a cor de cada
 * barra segue a intensidade: ciano na base, rosa só nos picos fortes.
 * Cada batida de grave solta faíscas das pontas das barras mais fortes
 * (decisão do responsável: as faíscas fazem parte do Anel, sem preset separado).
 */
export function createRing({ bandCount = 64, reducedMotion = false }: PresetOptions = {}): Visualization2D {
  const tracker = createBandTracker(bandCount, reducedMotion ? ENVELOPE_REDUCED_MOTION : ENVELOPE_MOTION)
  const { levels, peaks } = tracker.envelope
  const wave = createWaveformTracker(WAVE_POINTS, reducedMotion ? 60 : 18)
  const totalBars = bandCount * 2
  const step = TAU / totalBars

  // Faíscas: detector de batida, pool e pesos de sorteio por barra.
  const beats = createBeatDetector()
  const previousLevels = new Float32Array(bandCount)
  const particles = createParticleSystem(SPARK_CAPACITY)
  const cumulative = new Float32Array(totalBars)

  // Ângulos pré-calculados: lado direito (horário) e esquerdo (anti-horário) a partir do topo.
  const cos = new Float32Array(totalBars)
  const sin = new Float32Array(totalBars)
  for (let i = 0; i < bandCount; i++) {
    for (const [slot, side] of [[i, 1], [bandCount + i, -1]] as const) {
      const angle = -Math.PI / 2 + side * (i + 0.5) * step
      cos[slot] = Math.cos(angle)
      sin[slot] = Math.sin(angle)
    }
  }

  let width = 0
  let height = 0

  /** Solta faíscas das pontas das barras; barras fortes são sorteadas com mais frequência. */
  const emitSparks = (strength: number, inner: number, maxLength: number, size: number) => {
    if (size <= 0) return
    let total = 0
    for (let slot = 0; slot < totalBars; slot++) {
      const level = levels[slot % bandCount] ?? 0
      total += level * level + 0.002 // nível² favorece as pontas fortes; piso evita total zero
      cumulative[slot] = total
    }
    const amount = Math.round((reducedMotion ? 0.3 : 1) * (SPARK_COUNT_BASE + SPARK_COUNT_STRENGTH * strength))
    for (let k = 0; k < amount; k++) {
      // Busca binária no acumulado: sorteio ponderado em O(log n).
      const pick = Math.random() * total
      let lo = 0
      let hi = totalBars - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if ((cumulative[mid] ?? 0) < pick) lo = mid + 1
        else hi = mid
      }
      const level = levels[lo % bandCount] ?? 0
      const c = cos[lo] ?? 0
      const s = sin[lo] ?? 0
      const r = (inner + level * maxLength) / size
      const speed =
        (SPARK_SPEED_MIN + SPARK_SPEED_RANGE * Math.random()) * (0.6 + level) * (reducedMotion ? 0.5 : 1)
      const jitter = (Math.random() - 0.5) * 0.35 // desvio tangencial: leque, não raio perfeito
      particles.emit(
        c * r,
        s * r,
        (c - s * jitter) * speed,
        (s + c * jitter) * speed,
        SPARK_LIFE_MIN_MS + SPARK_LIFE_RANGE_MS * Math.random(),
        level,
      )
    }
  }

  /** Riscos luminosos em 9 lotes (3 cores × 3 níveis de opacidade) com mistura aditiva. */
  const drawSparks = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => {
    if (particles.count === 0) return
    const { x, y, vx, vy, life, maxLife, tone } = particles
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1.2, size * 0.0035)
    for (let colorBucket = 0; colorBucket < SPARK_COLORS.length; colorBucket++) {
      ctx.strokeStyle = SPARK_COLORS[colorBucket] ?? '#ffffff'
      for (let alphaBucket = 0; alphaBucket < SPARK_ALPHAS.length; alphaBucket++) {
        ctx.globalAlpha = SPARK_ALPHAS[alphaBucket] ?? 1
        ctx.beginPath()
        let any = false
        for (let i = 0; i < particles.count; i++) {
          if (Math.min(2, Math.floor((tone[i] ?? 0) * 3)) !== colorBucket) continue
          const remaining = (life[i] ?? 0) / (maxLife[i] || 1)
          if ((remaining > 0.66 ? 2 : remaining > 0.33 ? 1 : 0) !== alphaBucket) continue
          const px = cx + (x[i] ?? 0) * size
          const py = cy + (y[i] ?? 0) * size
          ctx.moveTo(px - (vx[i] ?? 0) * SPARK_STREAK_MS * size, py - (vy[i] ?? 0) * SPARK_STREAK_MS * size)
          ctx.lineTo(px, py)
          any = true
        }
        if (any) ctx.stroke()
      }
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  return {
    id: 'ring',
    kind: '2d',
    label: 'Anel',

    resize(w, h) {
      width = w
      height = h
    },

    render(ctx, frame, deltaMs) {
      tracker.update(frame, deltaMs)
      wave.update(frame ? frame.timeDomain : null, deltaMs, frame ? frame.waveGain : 1)

      // Faíscas: física antes da emissão (as novas não avançam neste quadro).
      particles.update(deltaMs, SPARK_DRAG_MS)
      const flux = deltaMs > 0 ? bassFlux(levels, previousLevels, FLUX_FROM, FLUX_TO) : 0
      const beat = beats.update(flux, deltaMs)

      ctx.clearRect(0, 0, width, height)
      if (width <= 0 || height <= 0) return

      const size = Math.min(width, height)
      const cx = width / 2
      const cy = height / 2
      const bass = averageLevel(levels, BASS_FROM, BASS_TO)
      const radius = size * 0.21 * (1 + (reducedMotion ? 0.04 : 0.12) * bass)
      const inner = radius + 4
      const maxLength = size * 0.25
      const lineWidth = Math.max(1.5, radius * step * 0.6)
      if (beat > 0) emitSparks(beat, inner, maxLength, size)

      // Brilho ambiente que preenche o palco e respira com os graves.
      const ambient = ctx.createRadialGradient(cx, cy, radius, cx, cy, Math.max(width, height) * 0.65)
      ambient.addColorStop(0, `rgba(124, 92, 255, ${0.04 + 0.16 * bass})`)
      ambient.addColorStop(0.5, `rgba(34, 211, 238, ${0.015 + 0.05 * bass})`)
      ambient.addColorStop(1, 'rgba(7, 8, 13, 0)')
      ctx.fillStyle = ambient
      ctx.fillRect(0, 0, width, height)

      // Brilho interno proporcional aos graves.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      glow.addColorStop(0, `rgba(124, 92, 255, ${0.06 + 0.32 * bass})`)
      glow.addColorStop(0.7, `rgba(34, 211, 238, ${0.03 + 0.1 * bass})`)
      glow.addColorStop(1, 'rgba(124, 92, 255, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, TAU)
      ctx.fill()

      // Núcleo luminoso que pulsa com os graves.
      const coreRadius = size * 0.035 * (1 + (reducedMotion ? 0.2 : 0.9) * bass)
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 3)
      core.addColorStop(0, `rgba(255, 255, 255, ${0.3 + 0.55 * bass})`)
      core.addColorStop(0.3, `rgba(34, 211, 238, ${0.2 + 0.35 * bass})`)
      core.addColorStop(1, 'rgba(124, 92, 255, 0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx, cy, coreRadius * 3, 0, TAU)
      ctx.fill()

      // Forma de onda circular (osciloscópio em laço) dentro do anel. A opacidade
      // acompanha a amplitude: em silêncio o laço some em vez de virar um círculo fixo.
      let waveEnergy = 0
      for (let i = 0; i < WAVE_POINTS; i++) waveEnergy = Math.max(waveEnergy, Math.abs(wave.samples[i] ?? 0))
      const waveAlpha = Math.min(1, waveEnergy / 0.08)
      const waveBase = radius * 0.6
      const waveAmp = radius * (reducedMotion ? 0.2 : 0.34)
      const taperSpan = WAVE_POINTS * 0.06 // funde início e fim do laço sem degrau
      ctx.beginPath()
      for (let i = 0; i < WAVE_POINTS; i++) {
        const taper = Math.min(1, Math.min(i, WAVE_POINTS - 1 - i) / taperSpan)
        const r = waveBase + (wave.samples[i] ?? 0) * waveAmp * taper
        const angle = -Math.PI / 2 + (i / WAVE_POINTS) * TAU
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.globalAlpha = waveAlpha
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.22)'
      ctx.lineWidth = 7
      ctx.lineJoin = 'round'
      ctx.stroke()
      const waveGradient = ctx.createLinearGradient(cx - waveBase, cy - waveBase, cx + waveBase, cy + waveBase)
      waveGradient.addColorStop(0, '#22d3ee')
      waveGradient.addColorStop(0.5, '#a78bfa')
      waveGradient.addColorStop(1, '#ff5ca8')
      ctx.strokeStyle = waveGradient
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1

      // Anel base.
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, radius - 2, 0, TAU)
      ctx.stroke()

      // Barras radiais com gradiente por intensidade: a cor depende da distância do
      // centro, então barras curtas ficam ciano e só as longas chegam ao rosa.
      const intensity = ctx.createRadialGradient(cx, cy, inner, cx, cy, inner + maxLength)
      intensity.addColorStop(0, '#22d3ee')
      intensity.addColorStop(0.5, '#7c5cff')
      intensity.addColorStop(1, '#ff5ca8')
      ctx.strokeStyle = intensity
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (let slot = 0; slot < totalBars; slot++) {
        const band = slot % bandCount
        const length = Math.max(1, (levels[band] ?? 0) * maxLength)
        const c = cos[slot] ?? 0
        const s = sin[slot] ?? 0
        ctx.moveTo(cx + c * inner, cy + s * inner)
        ctx.lineTo(cx + c * (inner + length), cy + s * (inner + length))
      }
      ctx.stroke()

      // Picos como pontos.
      if (!reducedMotion) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        ctx.beginPath()
        const dot = Math.max(1.2, lineWidth * 0.35)
        for (let slot = 0; slot < totalBars; slot++) {
          const peak = peaks[slot % bandCount] ?? 0
          if (peak <= 0.01) continue
          const r = inner + peak * maxLength + lineWidth + 2
          const x = cx + (cos[slot] ?? 0) * r
          const y = cy + (sin[slot] ?? 0) * r
          ctx.moveTo(x + dot, y)
          ctx.arc(x, y, dot, 0, TAU)
        }
        ctx.fill()
      }

      drawSparks(ctx, cx, cy, size)
    },

    isIdle: () => tracker.isIdle() && wave.isIdle() && particles.count === 0,

    dispose() {},
  }
}
