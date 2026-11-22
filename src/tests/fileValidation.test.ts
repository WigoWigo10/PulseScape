import { describe, expect, it } from 'vitest'
import { getExtension, validateAudioFile } from '../audio/fileValidation'

const file = (name: string, type: string, size = 1024) => ({ name, type, size })

describe('getExtension', () => {
  it('extrai a extensão em minúsculas', () => {
    expect(getExtension('Música.MP3')).toBe('mp3')
    expect(getExtension('a.b.flac')).toBe('flac')
    expect(getExtension('sem-extensao')).toBe('')
  })
})

describe('validateAudioFile', () => {
  it('aceita MIME audio/*', () => {
    expect(validateAudioFile(file('x.mp3', 'audio/mpeg')).ok).toBe(true)
    expect(validateAudioFile(file('x.bin', 'audio/x-m4a')).ok).toBe(true)
  })

  it('aceita MIME vazio com extensão de áudio conhecida', () => {
    expect(validateAudioFile(file('faixa.flac', '')).ok).toBe(true)
  })

  it('aceita contêiner de vídeo com extensão de áudio', () => {
    expect(validateAudioFile(file('faixa.webm', 'video/webm')).ok).toBe(true)
  })

  it('aceita MP3 exportado como .mpeg (Windows: video/mpeg)', () => {
    expect(validateAudioFile(file('WhatsApp Audio.mpeg', 'video/mpeg')).ok).toBe(true)
  })

  it('rejeita arquivos que claramente não são áudio', () => {
    expect(validateAudioFile(file('foto.png', 'image/png')).ok).toBe(false)
    expect(validateAudioFile(file('notas.txt', '')).ok).toBe(false)
    expect(validateAudioFile(file('video.mkv', 'video/x-matroska')).ok).toBe(false)
  })

  it('rejeita arquivo vazio', () => {
    const result = validateAudioFile(file('x.mp3', 'audio/mpeg', 0))
    expect(result.ok).toBe(false)
  })
})
