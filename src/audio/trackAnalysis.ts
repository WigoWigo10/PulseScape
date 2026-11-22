/**
 * Política da análise opcional de volume da faixa (lógica pura, testável).
 * Ver docs/decisions.md, D17, e docs/PRE_PUBLICACAO.md, P0.1.
 *
 * A análise decodifica o arquivo inteiro para medir o volume (D9). Ela é opcional:
 * se for pulada, o ganho de visualização fica em 0 dB e a música toca normalmente.
 */

/**
 * Taxa de decodificação da análise. Medido nas 3 faixas de teste: o volume (P90 RMS)
 * em 8 kHz difere ≤ 0,1 dB do medido em 44,1 kHz (o ganho é arredondado a 0,5 dB),
 * com PCM ~5,5× menor (ex.: 79 MB → 14 MB numa faixa de 4 min).
 */
export const ANALYSIS_SAMPLE_RATE = 8000
/** Acima disto a análise é pulada (~58 MB de PCM estéreo a 8 kHz). */
export const MAX_ANALYSIS_SECONDS = 15 * 60
/** O arquivo codificado também fica em memória (ArrayBuffer) durante a análise. */
export const MAX_ANALYSIS_FILE_BYTES = 80 * 1024 * 1024

export type AnalysisDecision =
  | { analyze: true }
  | { analyze: false; reason: 'file-too-large' | 'too-long' | 'unknown-duration' }

/**
 * Decide se a faixa será analisada, com base no tamanho do arquivo e na duração
 * (conhecida no `loadedmetadata`, antes de qualquer decodificação).
 */
export function decideTrackAnalysis(fileBytes: number, durationSeconds: number): AnalysisDecision {
  if (fileBytes > MAX_ANALYSIS_FILE_BYTES) return { analyze: false, reason: 'file-too-large' }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return { analyze: false, reason: 'unknown-duration' }
  if (durationSeconds > MAX_ANALYSIS_SECONDS) return { analyze: false, reason: 'too-long' }
  return { analyze: true }
}

/** Memória estimada da análise: arquivo codificado + PCM float32 na taxa de análise. */
export function estimateAnalysisBytes(fileBytes: number, durationSeconds: number, channels = 2): number {
  return fileBytes + Math.ceil(durationSeconds * ANALYSIS_SAMPLE_RATE) * channels * 4
}

export interface LatestOnlyRunner<T> {
  /** Executa já se ocioso; senão guarda como próxima, substituindo a que estava na fila. */
  run(job: T): void
  /** Descarta a fila (a tarefa em andamento não pode ser cancelada e termina sozinha). */
  clear(): void
  readonly busy: boolean
  readonly hasQueued: boolean
}

/**
 * Executa no máximo uma tarefa assíncrona por vez e mantém só a **última** pedida na
 * fila. `decodeAudioData` não pode ser cancelado: sem isto, trocas rápidas de faixa
 * empilhariam várias decodificações simultâneas em memória.
 */
export function createLatestOnlyRunner<T>(task: (job: T) => Promise<void>): LatestOnlyRunner<T> {
  let busy = false
  let queued: { job: T } | null = null

  const start = (job: T) => {
    busy = true
    task(job)
      .catch(() => {
        // A tarefa trata seus próprios erros; isto só impede rejeição não tratada.
      })
      .finally(() => {
        busy = false
        const next = queued
        queued = null
        if (next) start(next.job)
      })
  }

  return {
    run(job) {
      if (busy) queued = { job }
      else start(job)
    },
    clear() {
      queued = null
    },
    get busy() {
      return busy
    },
    get hasQueued() {
      return queued !== null
    },
  }
}
