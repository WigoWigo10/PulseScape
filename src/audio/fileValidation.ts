/**
 * Triagem inicial do arquivo escolhido. Rejeita apenas o que claramente não é
 * áudio; a palavra final sobre suporte é do próprio <audio> (evento `error`),
 * pois `canPlayType` e o MIME informado pelo sistema geram falsos negativos
 * (ex.: FLAC/M4A com `type` vazio no Windows).
 */

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3', 'mpeg', 'mpga', 'mpg', 'wav', 'wave', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'webm', 'weba', 'mp4',
])

/**
 * Contêineres de vídeo que frequentemente carregam apenas áudio. Ex.: o WhatsApp
 * exporta MP3 com extensão `.mpeg`, que o Windows rotula como `video/mpeg`.
 */
const AUDIO_CAPABLE_VIDEO_TYPES = new Set(['video/webm', 'video/mp4', 'video/ogg', 'video/mpeg'])

/**
 * Valor para `<input accept>`: `audio/*` mais extensões explícitas, para que arquivos
 * rotulados como vídeo pelo sistema (ex.: `.mpeg`) apareçam no seletor.
 */
export const FILE_INPUT_ACCEPT = ['audio/*', ...[...AUDIO_EXTENSIONS].map((ext) => `.${ext}`)].join(',')

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export interface FileLike {
  name: string
  type: string
  size: number
}

export function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function validateAudioFile(file: FileLike): ValidationResult {
  if (file.size === 0) {
    return { ok: false, reason: `“${file.name}” está vazio.` }
  }

  const type = file.type.toLowerCase()
  const knownExtension = AUDIO_EXTENSIONS.has(getExtension(file.name))

  if (type.startsWith('audio/')) return { ok: true }
  if (AUDIO_CAPABLE_VIDEO_TYPES.has(type) && knownExtension) return { ok: true }
  if (type === '' && knownExtension) return { ok: true }

  return {
    ok: false,
    reason: `“${file.name}” não parece ser um arquivo de áudio.`,
  }
}
