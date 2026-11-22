import { describe, expect, it } from 'vitest'
import { createMat4, lookAt, multiply, perspective, transformPoint } from '../visualizations/gl/mat4'

const ndc = (clip: [number, number, number, number]) => clip.map((v) => v / clip[3]) as [number, number, number, number]

describe('mat4', () => {
  it('identidade não altera pontos e é neutra na multiplicação', () => {
    const id = createMat4()
    expect(transformPoint(id, [1, 2, 3])).toEqual([1, 2, 3, 1])
    const p = perspective(createMat4(), 1, 1.5, 0.1, 10)
    expect([...multiply(createMat4(), id, p)]).toEqual([...p])
  })

  it('lookAt leva o olho à origem e o alvo para −z', () => {
    const view = lookAt(createMat4(), [0, 1, 2], [0, 1, -3], [0, 1, 0])
    const eye = transformPoint(view, [0, 1, 2])
    const target = transformPoint(view, [0, 1, -3])
    expect(eye[0]).toBeCloseTo(0, 6)
    expect(eye[1]).toBeCloseTo(0, 6)
    expect(eye[2]).toBeCloseTo(0, 6)
    expect(target[2]).toBeCloseTo(-5, 6)
    // “Para cima” do mundo continua para cima na câmera.
    expect(transformPoint(view, [0, 2, -3])[1]).toBeGreaterThan(0)
  })

  it('perspectiva: plano near → z −1, far → z +1, centro no meio da tela', () => {
    const proj = perspective(createMat4(), Math.PI / 3, 2, 0.5, 20)
    expect(ndc(transformPoint(proj, [0, 0, -0.5]))[2]).toBeCloseTo(-1, 5)
    expect(ndc(transformPoint(proj, [0, 0, -20]))[2]).toBeCloseTo(1, 5)
    const center = ndc(transformPoint(proj, [0, 0, -5]))
    expect(center[0]).toBeCloseTo(0, 6)
    expect(center[1]).toBeCloseTo(0, 6)
  })

  it('perspectiva: objetos mais distantes aparecem menores', () => {
    const proj = perspective(createMat4(), Math.PI / 3, 1, 0.1, 100)
    const near = ndc(transformPoint(proj, [1, 0, -2]))[0]
    const far = ndc(transformPoint(proj, [1, 0, -8]))[0]
    expect(far).toBeLessThan(near)
    expect(near / far).toBeCloseTo(4, 5)
  })
})
