import { describe, expect, it } from 'vitest'
import { createParticleSystem } from '../visualizations/particles'

describe('createParticleSystem', () => {
  it('emite e move partículas pela velocidade', () => {
    const p = createParticleSystem(10)
    p.emit(0, 0, 1, -2, 1000, 0.5)
    expect(p.count).toBe(1)
    p.update(10, 1e9) // arrasto desprezível
    expect(p.x[0]).toBeCloseTo(10, 3)
    expect(p.y[0]).toBeCloseTo(-20, 3)
    expect(p.life[0]).toBeCloseTo(990, 3)
    expect(p.tone[0]).toBeCloseTo(0.5, 5)
  })

  it('o arrasto reduz a velocidade de forma independente da taxa de quadros', () => {
    const a = createParticleSystem(1)
    const b = createParticleSystem(1)
    a.emit(0, 0, 1, 0, 10_000, 0)
    b.emit(0, 0, 1, 0, 10_000, 0)
    for (let i = 0; i < 6; i++) a.update(1000 / 60, 500)
    for (let i = 0; i < 12; i++) b.update(1000 / 120, 500)
    expect(a.vx[0]).toBeCloseTo(b.vx[0] ?? 0, 5)
    expect(a.vx[0]).toBeLessThan(1)
  })

  it('remove partículas mortas mantendo as vivas compactadas', () => {
    const p = createParticleSystem(10)
    p.emit(1, 0, 0, 0, 50, 0) // morre primeiro
    p.emit(2, 0, 0, 0, 500, 0)
    p.emit(3, 0, 0, 0, 50, 0) // morre primeiro
    p.emit(4, 0, 0, 0, 500, 0)
    p.update(100, 1e9)
    expect(p.count).toBe(2)
    expect([p.x[0], p.x[1]].sort()).toEqual([2, 4])
  })

  it('com o pool cheio substitui a partícula mais perto de sumir', () => {
    const p = createParticleSystem(2)
    p.emit(1, 0, 0, 0, 100, 0)
    p.emit(2, 0, 0, 0, 900, 0)
    p.emit(3, 0, 0, 0, 800, 0)
    expect(p.count).toBe(2)
    expect([p.x[0], p.x[1]].sort()).toEqual([2, 3])
  })

  it('esvazia tudo com o tempo e com clear', () => {
    const p = createParticleSystem(5)
    for (let i = 0; i < 5; i++) p.emit(0, 0, 0, 0, 300 + i * 100, 0)
    p.update(1000, 500)
    expect(p.count).toBe(0)
    p.emit(0, 0, 0, 0, 300, 0)
    p.clear()
    expect(p.count).toBe(0)
  })

  it('deltaMs zero não altera nada', () => {
    const p = createParticleSystem(1)
    p.emit(0, 0, 1, 1, 100, 0)
    p.update(0, 500)
    expect(p.x[0]).toBe(0)
    expect(p.life[0]).toBe(100)
  })
})
