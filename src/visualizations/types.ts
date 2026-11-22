import type { AudioFrame } from '../audio/analysis'

/**
 * Ciclo de vida de um preset. Presets apenas desenham: não abrem arquivos,
 * não pedem permissões e não criam AudioContext.
 *
 * Dois tipos, porque um canvas não troca de contexto depois de criado: o
 * `VisualizerCanvas` mantém um canvas 2D e um WebGL2 e mostra o do preset ativo.
 */
interface VisualizationBase {
  readonly id: string
  readonly label: string
  /** true quando nada mais se move: o loop pode parar enquanto o áudio estiver parado. */
  isIdle(): boolean
}

export interface Visualization2D extends VisualizationBase {
  readonly kind: '2d'
  /** Tamanho em pixels CSS (o contexto já vem escalado pelo devicePixelRatio). */
  resize(width: number, height: number): void
  /**
   * Desenha um frame. `frame` é null quando ainda não há analisador (antes do
   * primeiro play). `deltaMs` = 0 significa apenas redesenhar o estado atual.
   */
  render(ctx: CanvasRenderingContext2D, frame: AudioFrame | null, deltaMs: number): void
  dispose(): void
}

/**
 * Canal do preset com o `VisualizerCanvas`, para o que acontece **depois** do
 * `init` (ex.: import dinâmico do Three.js). Chamadas de um preset que já não está
 * ativo (troca rápida, desmontagem) são ignoradas.
 */
export interface VisualizationHost {
  /** O preset ficou pronto: redesenhar mesmo com o loop parado (ex.: música pausada). */
  requestRedraw(): void
  /** O preset não pode funcionar: o canvas troca para um preset 2D e avisa o usuário. */
  fail(message: string): void
}

export interface VisualizationGL extends VisualizationBase {
  readonly kind: 'webgl2'
  /**
   * Cria shaders, buffers e texturas. Chamado ao ativar o preset e de novo após
   * perda/restauração do contexto WebGL (os recursos antigos já não existem).
   * Pode lançar erro (ex.: falha de compilação): o canvas cai para um preset 2D.
   * Trabalho assíncrono (ex.: import dinâmico) sinaliza conclusão/falha via `host`.
   */
  init(gl: WebGL2RenderingContext, host: VisualizationHost): void
  /** Tamanho em pixels CSS e em pixels do buffer de desenho (para o viewport). */
  resize(width: number, height: number, pixelWidth: number, pixelHeight: number): void
  render(gl: WebGL2RenderingContext, frame: AudioFrame | null, deltaMs: number): void
  /** Libera recursos de GPU. `gl` é null se o contexto já se perdeu. */
  dispose(gl: WebGL2RenderingContext | null): void
}

export type Visualization = Visualization2D | VisualizationGL
