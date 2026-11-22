import { describe, expect, it } from 'vitest'
import { createTunnelMotion, DEFAULT_MOTION, standoutWeight } from '../visualizations/tunnelMotion'

const FRAME = 1000 / 60

/** Bumbos regulares (excesso `typical`) a cada `periodMs`; opcionalmente um destaque. */
function play(
  motion: ReturnType<typeof createTunnelMotion>,
  beats: number,
  periodMs = 500,
  excessAt: (beat: number) => number = () => 0.5,
) {
  const framesPerBeat = Math.round(periodMs / FRAME)
  const speeds: number[] = []
  for (let b = 0; b < beats; b++) {
    for (let f = 0; f < framesPerBeat; f++) speeds.push(motion.update(f === 0 ? excessAt(b) : null, 0.5, FRAME))
  }
  return speeds
}

describe('standoutWeight', () => {
  it('golpes no nível típico ou abaixo não geram embalo; destaques geram peso cheio', () => {
    expect(standoutWeight(0.5, 0.5, 0.2, 1.5, 0.5)).toBe(0)
    expect(standoutWeight(0.3, 0.5, 0.2, 1.5, 0.5)).toBe(0)
    expect(standoutWeight(0.8, 0.5, 0.2, 1.5, 0.5)).toBeCloseTo(1, 5)
    expect(standoutWeight(0.65, 0.5, 0.2, 1.5, 0.5)).toBeLessThan(0.5) // curva acentuada
  })

  it('o piso relativo impede que diferenças mínimas virem destaque', () => {
    // Desvio quase nulo: sem piso, 0,55 sobre 0,5 seria peso cheio; com piso, < 10%.
    expect(standoutWeight(0.55, 0.5, 0.001, 1.5, 0.5)).toBeLessThan(0.1)
    expect(standoutWeight(0.75, 0.5, 0.001, 1.5, 0.5)).toBeCloseTo(1, 5)
  })
})

describe('createTunnelMotion', () => {
  it('bumbos regulares e iguais não aceleram: velocidade fica perto da base', () => {
    const speeds = play(createTunnelMotion(), 20)
    const tail = speeds.slice(-120)
    expect(Math.max(...tail)).toBeLessThan(DEFAULT_MOTION.base * 1.5)
  })

  it('um golpe de destaque entre bumbos comuns acelera bem acima da base', () => {
    const m = createTunnelMotion()
    const speeds = play(m, 16, 500, (b) => (b === 12 ? 2 : 0.5 + (b % 2) * 0.05))
    const beforeStandout = speeds.slice(10 * 30, 12 * 30)
    const afterStandout = speeds.slice(12 * 30, 13 * 30)
    expect(Math.max(...afterStandout)).toBeGreaterThan(DEFAULT_MOTION.base * 4)
    expect(Math.max(...beforeStandout)).toBeLessThan(DEFAULT_MOTION.base * 2)
  })

  it('a aceleração passa e volta à base', () => {
    const m = createTunnelMotion()
    play(m, 12, 500, (b) => (b === 11 ? 2 : 0.5))
    for (let i = 0; i < 300; i++) m.update(null, 0.5, FRAME) // 5 s sem batidas
    expect(m.speed).toBeCloseTo(DEFAULT_MOTION.base, 2)
  })

  it('trecho mais forte que a média recente acelera; trecho calmo não', () => {
    const m = createTunnelMotion()
    for (let i = 0; i < 600; i++) m.update(null, 0.45, FRAME) // 10 s calmos
    const calm = m.speed
    for (let i = 0; i < 240; i++) m.update(null, 0.65, FRAME) // 4 s de refrão bem mais forte
    expect(m.section).toBeGreaterThan(0.4)
    expect(m.speed).toBeGreaterThan(calm + 0.2)
  })

  it('oscilação pequena de energia não conta como trecho forte', () => {
    const m = createTunnelMotion()
    for (let i = 0; i < 1200; i++) m.update(null, 0.5 + 0.03 * Math.sin(i / 20), FRAME) // 20 s
    expect(m.section).toBeLessThan(0.15)
  })

  it('deltaMs zero não altera nada', () => {
    const m = createTunnelMotion()
    m.update(5, 0.9, 0)
    expect(m.speed).toBe(DEFAULT_MOTION.base)
    expect(m.momentum).toBe(0)
  })
})
