/** Faixa de dB base do AnalyserNode (sem reforço de faixa). */
export const ANALYSER_MIN_DB = -90
export const ANALYSER_MAX_DB = -20

/**
 * Contrato de dados analisados entregue às visualizações (ver docs/decisions.md, D2).
 * Os arrays são pré-alocados e reutilizados a cada frame: as visualizações não devem
 * guardar referências a eles entre frames nem modificá-los.
 */
export interface AudioFrame {
  /** Magnitudes em bytes (0–255, escala dB entre min/maxDecibels), tamanho fftSize/2. */
  readonly frequency: Uint8Array<ArrayBuffer>
  /** Forma de onda em bytes (128 = zero), tamanho fftSize. */
  readonly timeDomain: Uint8Array<ArrayBuffer>
  readonly sampleRate: number
  readonly fftSize: number
  /** Milissegundos desde o frame anterior. */
  deltaMs: number
  /**
   * Ganho linear da faixa para a forma de onda — o mesmo reforço (dB) aplicado à
   * faixa de dB do analisador, para que espectro e onda reajam de forma coerente.
   */
  waveGain: number
}

/** Lê o AnalyserNode para um AudioFrame reutilizável. */
export class FrameReader {
  private readonly analyser: AnalyserNode
  private readonly frame: AudioFrame

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser
    this.frame = {
      frequency: new Uint8Array(analyser.frequencyBinCount),
      timeDomain: new Uint8Array(analyser.fftSize),
      sampleRate: analyser.context.sampleRate,
      fftSize: analyser.fftSize,
      deltaMs: 0,
      waveGain: 1,
    }
  }

  read(deltaMs: number): AudioFrame {
    this.analyser.getByteFrequencyData(this.frame.frequency)
    this.analyser.getByteTimeDomainData(this.frame.timeDomain)
    this.frame.deltaMs = deltaMs
    // Reforço atual (dB) = quanto a faixa máxima foi rebaixada em relação à base.
    this.frame.waveGain = 10 ** ((ANALYSER_MAX_DB - this.analyser.maxDecibels) / 20)
    return this.frame
  }
}
