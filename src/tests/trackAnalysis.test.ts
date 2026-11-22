import { describe, expect, it } from 'vitest'
import {
  createLatestOnlyRunner,
  decideTrackAnalysis,
  estimateAnalysisBytes,
  MAX_ANALYSIS_FILE_BYTES,
  MAX_ANALYSIS_SECONDS,
} from '../audio/trackAnalysis'

const MB = 1024 * 1024

describe('decideTrackAnalysis', () => {
  it('analisa músicas comuns', () => {
    expect(decideTrackAnalysis(9 * MB, 235)).toEqual({ analyze: true })
  })

  it('pula arquivos grandes demais, mesmo curtos', () => {
    expect(decideTrackAnalysis(MAX_ANALYSIS_FILE_BYTES + 1, 60)).toEqual({ analyze: false, reason: 'file-too-large' })
  })

  it('pula áudios longos demais', () => {
    expect(decideTrackAnalysis(30 * MB, MAX_ANALYSIS_SECONDS + 1)).toEqual({ analyze: false, reason: 'too-long' })
    expect(decideTrackAnalysis(30 * MB, MAX_ANALYSIS_SECONDS)).toEqual({ analyze: true })
  })

  it('pula quando a duração é desconhecida (stream, metadado ausente)', () => {
    for (const d of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(decideTrackAnalysis(5 * MB, d)).toEqual({ analyze: false, reason: 'unknown-duration' })
    }
  })

  it('estima a memória: arquivo + PCM float32 a 8 kHz', () => {
    expect(estimateAnalysisBytes(10 * MB, 60)).toBe(10 * MB + 60 * 8000 * 2 * 4)
    // No limite de duração, o PCM fica abaixo de 60 MB.
    expect(estimateAnalysisBytes(0, MAX_ANALYSIS_SECONDS)).toBeLessThan(60 * MB)
  })
})

/** Tarefa controlável: cada chamada fica pendente até `finish(job)`. */
function controllableTask() {
  const started: number[] = []
  const resolvers = new Map<number, () => void>()
  const task = (job: number) =>
    new Promise<void>((resolve) => {
      started.push(job)
      resolvers.set(job, resolve)
    })
  const finish = async (job: number) => {
    resolvers.get(job)?.()
    // Deixa as microtarefas (finally → próxima tarefa) rodarem.
    await new Promise((r) => setTimeout(r, 0))
  }
  return { task, started, finish }
}

describe('createLatestOnlyRunner', () => {
  it('executa uma tarefa por vez', () => {
    const { task, started } = controllableTask()
    const runner = createLatestOnlyRunner(task)
    runner.run(1)
    runner.run(2)
    expect(started).toEqual([1])
    expect(runner.busy).toBe(true)
    expect(runner.hasQueued).toBe(true)
  })

  it('em trocas rápidas mantém só a última da fila', async () => {
    const { task, started, finish } = controllableTask()
    const runner = createLatestOnlyRunner(task)
    runner.run(1)
    runner.run(2)
    runner.run(3)
    runner.run(4)
    await finish(1)
    expect(started).toEqual([1, 4]) // 2 e 3 nunca foram decodificadas
    await finish(4)
    expect(runner.busy).toBe(false)
  })

  it('clear descarta a fila sem interromper a tarefa atual', async () => {
    const { task, started, finish } = controllableTask()
    const runner = createLatestOnlyRunner(task)
    runner.run(1)
    runner.run(2)
    runner.clear()
    await finish(1)
    expect(started).toEqual([1])
    expect(runner.busy).toBe(false)
  })

  it('continua funcionando depois de uma tarefa que falha', async () => {
    const started: number[] = []
    const runner = createLatestOnlyRunner(async (job: number) => {
      started.push(job)
      if (job === 1) throw new Error('falha de decodificação')
    })
    runner.run(1)
    runner.run(2)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([1, 2])
  })
})
