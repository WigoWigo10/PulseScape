import { bassFlux, createBeatDetector } from './beatDetector'
import { createSnapshotHistory } from './snapshotHistory'
import { createTunnelMotion } from './tunnelMotion'
import type { PresetOptions } from './spectrum'
import type { Visualization2D } from './types'
import { averageLevel, createBandTracker, ENVELOPE_MOTION, ENVELOPE_REDUCED_MOTION } from './spectrumBands'

const TAU = Math.PI * 2
/** Distância (odômetro) entre anéis e o percurso total do fundo até passar pela tela. */
const RING_SPACING = 70
const TRAVEL = 1500
/** Profundidade z no nascimento e ao passar pela câmera (escala = 1 / z). */
const Z_FAR = 9
const Z_NEAR = 0.42
/**
 * Velocidade do voo: base lenta + embalo das batidas fortes + aceleração nos trechos
 * mais fortes da música (ver `tunnelMotion.ts` e docs/decisions.md, D13).
 * Reduzir movimento: velocidade fixa.
 */
const SPEED_REDUCED = 0.3
/** Giro acumulado ao longo da profundidade (espiral) e giro global por distância. */
const TWIST = 0.7
const SPIN_PER_UNIT = 0.0003
const BASS_FROM = 3
const BASS_TO = 15
/** Bandas usadas no fluxo de batida (~35–140 Hz), como na calibração (D12). */
const FLUX_FROM = 2
const FLUX_TO = 16
/**
 * Em silêncio (pausa/fim) o túnel congela após este tempo em vez de esperar os anéis
 * saírem — na base lenta isso levava ~7 s com o loop rodando à toa.
 */
const FREEZE_AFTER_SILENCE_MS = 1500

/**
 * Túnel: voo através de anéis. Cada anel nasce pequeno no ponto de fuga com o
 * espectro daquele instante e vem em direção à câmera, passando pelas bordas.
 * Cada batida detectada nos graves dá um tranco para frente, um clarão, uma onda
 * de choque e marca o anel nascido naquele instante — o impacto que se ouve vira
 * impacto visual. Canvas 2D, sem WebGL (ver docs/decisions.md, D11–D12).
 */
export function createTunnel({ bandCount = 64, reducedMotion = false }: PresetOptions = {}): Visualization2D {
  const tracker = createBandTracker(bandCount, reducedMotion ? ENVELOPE_REDUCED_MOTION : ENVELOPE_MOTION)
  const { levels } = tracker.envelope
  const history = createSnapshotHistory(bandCount, RING_SPACING, TRAVEL)
  const beats = createBeatDetector()
  const previousLevels = new Float32Array(bandCount)
  const totalBars = bandCount * 2
  const step = TAU / totalBars

  // Direções unitárias de cada barra (espelhadas, graves no topo), em torno da origem.
  const cos = new Float32Array(totalBars)
  const sin = new Float32Array(totalBars)
  for (let i = 0; i < bandCount; i++) {
    for (const [slot, side] of [[i, 1], [bandCount + i, -1]] as const) {
      const angle = -Math.PI / 2 + side * (i + 0.5) * step
      cos[slot] = Math.cos(angle)
      sin[slot] = Math.sin(angle)
    }
  }

  const motion = createTunnelMotion()

  let width = 0
  let height = 0
  /** Força da última batida: normaliza o progresso da onda de choque. */
  let lastBeatStrength = 1
  /** Tempo contínuo com o espectro em silêncio (ms). */
  let silentMs = 0

  return {
    id: 'tunnel',
    kind: '2d',
    label: 'Túnel',

    resize(w, h) {
      width = w
      height = h
    },

    render(ctx, frame, deltaMs) {
      tracker.update(frame, deltaMs)
      if (deltaMs > 0) silentMs = tracker.isIdle() ? silentMs + deltaMs : 0

      const energy = averageLevel(levels, 0, bandCount)
      const bass = averageLevel(levels, BASS_FROM, BASS_TO)
      // Fluxo só avança com tempo real (deltaMs 0 = redesenho, não pode zerar o anterior).
      const flux = deltaMs > 0 ? bassFlux(levels, previousLevels, FLUX_FROM, FLUX_TO) : 0
      const beat = beats.update(flux, deltaMs)
      if (beat > 0) lastBeatStrength = beat
      const impulse = beats.impulse

      // Movimento com rampa; clarão, onda de choque e anel marcado seguem instantâneos.
      const speed = motion.update(beat > 0 ? beats.lastExcess : null, energy, deltaMs)
      history.advance(levels, deltaMs, reducedMotion ? SPEED_REDUCED : speed, beat)

      ctx.clearRect(0, 0, width, height)
      if (width <= 0 || height <= 0) return

      const size = Math.min(width, height)
      const cx = width / 2
      const cy = height / 2
      const odometer = history.clock

      // Ponto de fuga que se desloca devagar: túnel que faz curvas.
      const vpX = cx + (reducedMotion ? 0 : Math.cos(odometer * 0.00031) * size * 0.16)
      const vpY = cy + (reducedMotion ? 0 : Math.sin(odometer * 0.00023) * size * 0.11)
      const spin = reducedMotion ? 0 : odometer * SPIN_PER_UNIT

      // Brilho ambiente no fundo do túnel, com clarão na batida.
      const flash = (reducedMotion ? 0.25 : 1) * impulse
      const ambient = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, Math.max(width, height) * 0.7)
      ambient.addColorStop(0, `rgba(124, 92, 255, ${0.08 + 0.15 * bass + 0.25 * flash})`)
      ambient.addColorStop(0.4, `rgba(34, 211, 238, ${0.02 + 0.04 * bass + 0.1 * flash})`)
      ambient.addColorStop(1, 'rgba(7, 8, 13, 0)')
      ctx.fillStyle = ambient
      ctx.fillRect(0, 0, width, height)

      // Brilho global: base discreta, sobe com o grave e salta na batida.
      const pulse = 0.5 + 0.3 * bass + 0.6 * flash
      const baseRadius = size * 0.2
      const baseLength = size * 0.2
      ctx.lineCap = 'round'

      // Do fundo (recém-nascidos, pequenos) para a frente (grandes, passando pela tela).
      history.forEach((snapshot, travelled, peak, mark) => {
        const t = travelled / TRAVEL // 0 = nasceu no fundo, 1 = passou pela câmera
        const z = Z_FAR + (Z_NEAR - Z_FAR) * t
        const scale = 1 / z
        const fadeIn = Math.min(1, t / 0.12)
        const fadeOut = Math.min(1, (1 - t) / 0.18)
        const alpha = fadeIn * fadeOut * (pulse + 0.5 * mark)
        if (alpha <= 0.01) return

        // Anéis perto da câmera ficam centrados na tela; os do fundo, no ponto de fuga.
        const near = Math.min(1, scale / (1 / Z_NEAR))
        const x = vpX + (cx - vpX) * near
        const y = vpY + (cy - vpY) * near
        const radius = baseRadius * scale
        const maxLength = baseLength * scale
        const lineWidth = Math.max(1, radius * step * 0.55 * (1 + 0.8 * mark))
        // Anéis pequenos (fundo) com metade das barras: de longe o detalhe não aparece.
        const stride = scale < 0.35 ? 2 : 1

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(spin + (reducedMotion ? 0 : (1 - t) * TWIST))
        ctx.globalAlpha = Math.min(1, alpha)

        // Contorno: estrutura do túnel; anéis nascidos numa batida ficam marcados.
        ctx.strokeStyle = mark > 0 ? 'rgba(190, 240, 255, 0.95)' : 'rgba(124, 92, 255, 0.5)'
        ctx.lineWidth = Math.max(0.75, scale * (1.4 + 4 * mark))
        ctx.beginPath()
        ctx.arc(0, 0, radius, 0, TAU)
        ctx.stroke()

        if (peak > 0.01) {
          const inner = radius + 2 * scale
          const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, inner + maxLength)
          gradient.addColorStop(0, '#22d3ee')
          gradient.addColorStop(0.5, '#7c5cff')
          gradient.addColorStop(1, '#ff5ca8')
          ctx.strokeStyle = gradient
          ctx.lineWidth = lineWidth
          ctx.beginPath()
          for (let slot = 0; slot < totalBars; slot += stride) {
            const length = (snapshot[slot % bandCount] ?? 0) * maxLength
            if (length < 0.5) continue
            const c = cos[slot] ?? 0
            const s = sin[slot] ?? 0
            ctx.moveTo(c * inner, s * inner)
            ctx.lineTo(c * (inner + length), s * (inner + length))
          }
          ctx.stroke()
        }
        ctx.restore()
      })

      // Onda de choque: círculo que se expande do fundo para fora a cada batida.
      if (!reducedMotion && impulse > 0.03) {
        const progress = 1 - Math.min(1, impulse / lastBeatStrength)
        const shockX = vpX + (cx - vpX) * progress
        const shockY = vpY + (cy - vpY) * progress
        ctx.globalAlpha = Math.min(1, impulse * 0.8)
        ctx.strokeStyle = 'rgba(200, 245, 255, 1)'
        ctx.lineWidth = 1.5 + 5 * impulse
        ctx.beginPath()
        ctx.arc(shockX, shockY, size * (0.08 + 0.85 * progress), 0, TAU)
        ctx.stroke()
      }

      // Núcleo no fundo do túnel: pulsa com o grave e explode na batida.
      const coreRadius = size * 0.06 * (1 + (reducedMotion ? 0.2 : 0.7) * bass + 1.2 * flash)
      const core = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, coreRadius)
      core.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, 0.3 + 0.4 * bass + 0.5 * flash)})`)
      core.addColorStop(0.35, `rgba(34, 211, 238, ${0.15 + 0.3 * bass + 0.3 * flash})`)
      core.addColorStop(1, 'rgba(124, 92, 255, 0)')
      ctx.globalAlpha = 1
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(vpX, vpY, coreRadius, 0, TAU)
      ctx.fill()
    },

    isIdle: () =>
      tracker.isIdle() &&
      beats.impulse < 0.01 &&
      (history.isSilent() || silentMs >= FREEZE_AFTER_SILENCE_MS),

    dispose() {},
  }
}
