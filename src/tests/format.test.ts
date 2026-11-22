import { describe, expect, it } from 'vitest'
import { formatTime } from '../audio/format'

describe('formatTime', () => {
  it('formata minutos e segundos', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(5.9)).toBe('0:05')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(599)).toBe('9:59')
  })

  it('inclui horas quando necessário', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3725)).toBe('1:02:05')
  })

  it('trata valores inválidos como zero', () => {
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00')
    expect(formatTime(-3)).toBe('0:00')
  })
})
