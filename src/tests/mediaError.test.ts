import { describe, expect, it } from 'vitest'
import { describeMediaError } from '../audio/mediaError'

describe('describeMediaError', () => {
  it('descreve formato não suportado', () => {
    expect(describeMediaError(4)).toMatch(/não suportado/)
  })

  it('descreve falha de decodificação', () => {
    expect(describeMediaError(3)).toMatch(/decodifica/)
  })

  it('tem mensagem genérica para código ausente', () => {
    expect(describeMediaError(undefined)).toMatch(/desconhecido/)
  })
})
