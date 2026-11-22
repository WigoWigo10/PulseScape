import { ANALYSER_MAX_DB, ANALYSER_MIN_DB } from './analysis'
import { describeMediaError } from './mediaError'
import { validateAudioFile } from './fileValidation'
import { measureLoudness, trackGainDb } from './loudness'
import { ANALYSIS_SAMPLE_RATE, createLatestOnlyRunner, decideTrackAnalysis } from './trackAnalysis'

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'

export interface PlayerSnapshot {
  readonly status: PlayerStatus
  readonly fileName: string | null
  readonly duration: number
  readonly currentTime: number
  /** Volume de saída 0..1 (aplicado após o analisador). */
  readonly volume: number
  /** Erro de carregamento/decodificação da faixa atual (status 'error'). */
  readonly errorMessage: string | null
  /** Aviso que não altera a faixa atual (arquivo rejeitado, reprodução bloqueada). */
  readonly notice: string | null
  /**
   * Reforço de visualização (dB) decidido para a faixa inteira; null enquanto a
   * faixa é analisada. Não altera o som, só a sensibilidade das visualizações.
   */
  readonly trackGainDb: number | null
}

export const INITIAL_SNAPSHOT: PlayerSnapshot = Object.freeze({
  status: 'idle',
  fileName: null,
  duration: 0,
  currentTime: 0,
  volume: 0.8,
  errorMessage: null,
  notice: null,
  trackGainDb: null,
})

/**
 * Pipeline de áudio único da sessão.
 *
 * Grafo: <audio> → MediaElementAudioSourceNode → AnalyserNode → GainNode → destino.
 * - Um único HTMLAudioElement e um único MediaElementAudioSourceNode por instância:
 *   o navegador só permite criar uma fonte por elemento, por isso trocar de faixa
 *   troca apenas o `src`.
 * - O AudioContext é criado de forma preguiçosa no primeiro `play()` (gesto do usuário)
 *   e retomado a cada reprodução, respeitando as políticas de autoplay.
 * - O volume fica no GainNode, depois do analisador: a visualização não depende do volume.
 * - Ganho por faixa: ao carregar, o arquivo é decodificado uma vez (localmente) para medir
 *   o volume da música inteira; faixas baixas deslocam a faixa de dB do analisador.
 *   Trechos baixos de uma música normal não recebem reforço (decisão D9).
 *
 * O estado é exposto como snapshot imutável compatível com `useSyncExternalStore`.
 */
export class AudioEngine {
  private readonly audio: HTMLAudioElement
  private readonly events = new AbortController()
  private readonly listeners = new Set<() => void>()
  private snapshot: PlayerSnapshot = INITIAL_SNAPSHOT

  private context: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private gain: GainNode | null = null
  private objectUrl: string | null = null
  private disposed = false
  /** Incrementado a cada carga: invalida análises de faixas anteriores ainda em andamento. */
  private loadToken = 0
  private gainDb = 0
  /** Web Audio falhou na criação: não tentar de novo a cada play. */
  private graphFailed = false
  /** Faixa aguardando a duração (`loadedmetadata`) para decidir se será analisada. */
  private pendingAnalysis: { file: File; token: number } | null = null
  /** Uma análise por vez; trocas rápidas mantêm só a última na fila (P0.1). */
  private readonly analysisRunner = createLatestOnlyRunner<{ file: File; token: number }>((job) =>
    this.analyzeTrack(job.file, job.token),
  )

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.volume = 1

    const on = <K extends keyof HTMLMediaElementEventMap>(type: K, handler: () => void) =>
      this.audio.addEventListener(type, handler, { signal: this.events.signal })

    on('loadedmetadata', () => {
      this.update({
        duration: this.readDuration(),
        status: this.snapshot.status === 'loading' ? 'ready' : this.snapshot.status,
      })
      this.startPendingAnalysis()
    })
    on('durationchange', () => this.update({ duration: this.readDuration() }))
    on('timeupdate', () => this.update({ currentTime: this.audio.currentTime }))
    on('playing', () => this.update({ status: 'playing', notice: null }))
    on('pause', () => {
      // Ao trocar de faixa ou ao encerrar, o próprio fluxo define o status.
      if (this.audio.ended || this.snapshot.status === 'loading' || this.snapshot.status === 'error') return
      this.update({ status: 'paused' })
    })
    on('ended', () => this.update({ status: 'ended', currentTime: this.audio.duration || 0 }))
    on('error', () => {
      if (!this.objectUrl) return
      // Arquivo que não toca não é analisado (a decodificação também falharia).
      this.pendingAnalysis = null
      this.update({ status: 'error', errorMessage: describeMediaError(this.audio.error?.code), trackGainDb: 0 })
    })
  }

  // ---- Interface para useSyncExternalStore -------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): PlayerSnapshot => this.snapshot

  // ---- Comandos ----------------------------------------------------------------------

  /** Carrega um arquivo local. Arquivos rejeitados não interrompem a faixa atual. */
  load(file: File): void {
    if (this.disposed) return

    const validation = validateAudioFile(file)
    if (!validation.ok) {
      this.update({ notice: validation.reason })
      return
    }

    // Define 'loading' antes de pausar: o evento 'pause' (assíncrono) será ignorado.
    this.update({
      status: 'loading',
      fileName: file.name,
      duration: 0,
      currentTime: 0,
      errorMessage: null,
      notice: null,
      trackGainDb: null,
    })
    this.audio.pause()

    const previousUrl = this.objectUrl
    this.objectUrl = URL.createObjectURL(file)
    this.audio.src = this.objectUrl // dispara o algoritmo de carregamento
    if (previousUrl) URL.revokeObjectURL(previousUrl)

    // O ganho da faixa anterior não pode vazar para a nova.
    this.loadToken += 1
    this.setTrackGain(0)
    // A análise só começa no loadedmetadata (precisa da duração); análises de faixas
    // anteriores que ainda estavam na fila são descartadas sem decodificar.
    this.analysisRunner.clear()
    this.pendingAnalysis = { file, token: this.loadToken }
  }

  /**
   * Decide, com tamanho e duração, se a faixa atual será analisada (P0.1). Arquivos
   * grandes, longos ou sem duração conhecida ficam com 0 dB e tocam normalmente.
   */
  private startPendingAnalysis(): void {
    const job = this.pendingAnalysis
    if (!job || job.token !== this.loadToken || this.disposed) return
    this.pendingAnalysis = null
    const decision = decideTrackAnalysis(job.file.size, this.audio.duration)
    if (!decision.analyze) {
      this.update({ trackGainDb: 0 })
      return
    }
    this.analysisRunner.run(job)
  }

  /**
   * Mede o volume da faixa inteira e define o reforço de visualização. Roda em
   * segundo plano (decodificação fora da thread principal) e não bloqueia o play.
   * O arquivo é lido localmente — nada é enviado pela rede.
   */
  private async analyzeTrack(file: File, token: number): Promise<void> {
    // Faixa já trocada enquanto esperava na fila: nem lê o arquivo.
    if (token !== this.loadToken || this.disposed) return
    let gainDb = 0
    try {
      const data = await file.arrayBuffer()
      if (token !== this.loadToken || this.disposed) return
      // Contexto offline em 8 kHz: decodifica sem gesto do usuário e sem saída de áudio,
      // com PCM ~5,5× menor que em 44,1 kHz (medição de volume equivalente; D17).
      const decoder = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE)
      const buffer = await decoder.decodeAudioData(data)
      if (token !== this.loadToken || this.disposed) return
      const channels: Float32Array[] = []
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c))
      gainDb = trackGainDb(measureLoudness(channels, buffer.sampleRate))
    } catch {
      // Falha de decodificação: sem reforço. Erros de reprodução vêm do <audio>.
      if (token !== this.loadToken || this.disposed) return
    }
    this.setTrackGain(gainDb)
    this.update({ trackGainDb: gainDb })
  }

  /** Desloca a faixa de dB do analisador: +X dB de reforço = faixa X dB mais baixa. */
  private setTrackGain(gainDb: number): void {
    this.gainDb = gainDb
    const analyser = this.analyser
    if (!analyser) return // aplicado em ensureGraph
    const min = ANALYSER_MIN_DB - gainDb
    const max = ANALYSER_MAX_DB - gainDb
    // min < max precisa valer a cada atribuição: a ordem depende do sentido da mudança.
    if (min < analyser.minDecibels) {
      analyser.minDecibels = min
      analyser.maxDecibels = max
    } else {
      analyser.maxDecibels = max
      analyser.minDecibels = min
    }
  }

  /** Deve ser chamado a partir de um gesto do usuário (clique/tecla). */
  async play(): Promise<void> {
    if (this.disposed || !this.objectUrl || this.snapshot.status === 'error') return

    // Criação síncrona dentro do gesto, antes de qualquer await.
    this.ensureGraph()

    try {
      if (this.context?.state === 'suspended') await this.context.resume()
      await this.audio.play()
    } catch (error) {
      if (error instanceof DOMException) {
        // AbortError: play() interrompido por pause()/troca de faixa — esperado.
        // NotSupportedError: tratado pelo evento 'error' do elemento.
        if (error.name === 'AbortError' || error.name === 'NotSupportedError') return
        if (error.name === 'NotAllowedError') {
          this.update({ notice: 'O navegador bloqueou a reprodução. Clique em reproduzir novamente.' })
          return
        }
      }
      this.update({ notice: 'Não foi possível iniciar a reprodução.' })
    }
  }

  pause(): void {
    this.audio.pause()
  }

  togglePlay(): void {
    if (this.snapshot.status === 'playing') this.pause()
    else void this.play()
  }

  seek(seconds: number): void {
    const duration = this.readDuration()
    if (!this.objectUrl || duration <= 0) return
    const target = Math.min(Math.max(seconds, 0), duration)
    this.audio.currentTime = target
    this.update({
      currentTime: target,
      status: this.snapshot.status === 'ended' ? 'paused' : this.snapshot.status,
    })
  }

  setVolume(value: number): void {
    const volume = Math.min(Math.max(value, 0), 1)
    if (this.gain && this.context) {
      // Rampa curta evita estalos ao arrastar o controle.
      this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.015)
    } else {
      // Sem GainNode (grafo ainda não criado ou falha parcial do Web Audio): volume no elemento.
      this.audio.volume = volume
    }
    this.update({ volume })
  }

  dismissNotice(): void {
    if (this.snapshot.notice) this.update({ notice: null })
  }

  /** Analisador compartilhado para as visualizações (null até o primeiro play). */
  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  /** Libera elemento, URL de objeto, listeners, nós e o AudioContext. Idempotente. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.loadToken += 1 // invalida a análise em andamento (o decode termina e é ignorado)
    this.analysisRunner.clear()
    this.pendingAnalysis = null

    this.events.abort()
    this.listeners.clear()

    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }

    this.source?.disconnect()
    this.analyser?.disconnect()
    this.gain?.disconnect()
    this.source = null
    this.analyser = null
    this.gain = null

    if (this.context && this.context.state !== 'closed') void this.context.close()
    this.context = null
  }

  // ---- Interno -----------------------------------------------------------------------

  private ensureGraph(): void {
    if (this.context || this.graphFailed) return
    let context: AudioContext | null = null
    let source: MediaElementAudioSourceNode | null = null
    try {
      context = new AudioContext()
      source = context.createMediaElementSource(this.audio)
      const analyser = context.createAnalyser()
      // 4096 → ~11,7 Hz por bin a 48 kHz: resolução suficiente para graves em escala log.
      analyser.fftSize = 4096
      // Suavização leve aqui; o envelope temporal fica nas visualizações (por deltaMs).
      analyser.smoothingTimeConstant = 0.5
      // Faixa base deslocada pelo reforço da faixa atual (0 dB na maioria das músicas).
      analyser.minDecibels = ANALYSER_MIN_DB - this.gainDb
      analyser.maxDecibels = ANALYSER_MAX_DB - this.gainDb
      const gain = context.createGain()
      gain.gain.value = this.snapshot.volume

      source.connect(analyser)
      analyser.connect(gain)
      gain.connect(context.destination)

      this.audio.volume = 1
      this.context = context
      this.source = source
      this.analyser = analyser
      this.gain = gain
    } catch {
      // Falha parcial: tenta uma única vez (repetir a cada play criaria contextos órfãos).
      this.graphFailed = true
      if (context && source) {
        // O <audio> já foi capturado pela fonte: sem ligá-la à saída, o som ficaria mudo.
        try {
          source.disconnect()
          source.connect(context.destination)
          this.context = context
          this.source = source
        } catch {
          void context.close()
        }
      } else if (context) {
        void context.close()
      }
      this.audio.volume = this.snapshot.volume
      this.update({ notice: 'Web Audio indisponível: a reprodução funciona, mas sem visualização.' })
    }
  }

  private readDuration(): number {
    const d = this.audio.duration
    return Number.isFinite(d) && d > 0 ? d : 0
  }

  private update(patch: Partial<PlayerSnapshot>): void {
    if (this.disposed) return
    let changed = false
    for (const key of Object.keys(patch) as (keyof PlayerSnapshot)[]) {
      if (patch[key] !== this.snapshot[key]) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
}
