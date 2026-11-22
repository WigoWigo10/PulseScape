import { useEffect, useRef } from 'react'
import { FrameReader, type AudioFrame } from '../audio/analysis'
import type { AudioEngine } from '../audio/AudioEngine'
import { getPreset, type PresetId } from '../visualizations/registry'
import type { Visualization } from '../visualizations/types'

const MAX_DPR = 2
/** Evita saltos após a aba ficar em segundo plano. */
const MAX_DELTA_MS = 100
const GL_OPTIONS: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: true }

interface VisualizerCanvasProps {
  engine: AudioEngine
  presetId: PresetId
  /** true enquanto o áudio toca; ao ficar false o loop roda até a animação assentar. */
  active: boolean
}

interface StageSize {
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
}

function resizeVisualization(visualization: Visualization, size: StageSize) {
  if (visualization.kind === '2d') visualization.resize(size.width, size.height)
  else visualization.resize(size.width, size.height, size.pixelWidth, size.pixelHeight)
}

/**
 * Dono dos canvases e do único loop de requestAnimationFrame. Há dois canvases
 * sobrepostos — 2D e WebGL2 — porque um canvas não troca de contexto; fica visível
 * o do preset ativo. Nada aqui passa por estado React: dados de frame vivem em
 * arrays reutilizados (FrameReader/preset). Trocar de preset substitui apenas a
 * visualização; loop e áudio seguem intactos.
 */
export function VisualizerCanvas({ engine, presetId, active }: VisualizerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvas2dRef = useRef<HTMLCanvasElement>(null)
  const canvasGlRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const glLostRef = useRef(false)
  const activeRef = useRef(active)
  const visualizationRef = useRef<Visualization | null>(null)
  const sizeRef = useRef<StageSize>({ width: 0, height: 0, pixelWidth: 1, pixelHeight: 1 })
  const wakeRef = useRef<() => void>(() => {})
  const redrawRef = useRef<() => void>(() => {})

  // Ciclo de vida do preset.
  useEffect(() => {
    const canvas2d = canvas2dRef.current
    const canvasGl = canvasGlRef.current
    if (!canvas2d || !canvasGl) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let visualization: Visualization = getPreset(presetId).create({ reducedMotion })

    if (visualization.kind === 'webgl2') {
      const gl = glRef.current ?? canvasGl.getContext('webgl2', GL_OPTIONS)
      let ready = false
      if (gl && !gl.isContextLost()) {
        glRef.current = gl
        try {
          visualization.init(gl)
          ready = true
        } catch (error) {
          console.error('[PulseScape] Falha ao iniciar preset WebGL:', error)
          visualization.dispose(gl)
        }
      }
      if (!ready) {
        // Sem WebGL2 (ou falha de shader): mantém a experiência com o Anel em 2D.
        console.warn('[PulseScape] WebGL2 indisponível; usando o preset Anel.')
        visualization = getPreset('ring').create({ reducedMotion })
      }
    }

    canvas2d.hidden = visualization.kind !== '2d'
    canvasGl.hidden = visualization.kind !== 'webgl2'
    resizeVisualization(visualization, sizeRef.current)
    visualizationRef.current = visualization
    redrawRef.current()

    const current = visualization
    return () => {
      if (visualizationRef.current === current) visualizationRef.current = null
      if (current.kind === '2d') current.dispose()
      else current.dispose(glLostRef.current ? null : glRef.current)
    }
  }, [presetId])

  // Canvases, resize, perda de contexto WebGL e loop de animação.
  useEffect(() => {
    const container = containerRef.current
    const canvas2d = canvas2dRef.current
    const canvasGl = canvasGlRef.current
    const ctx = canvas2d?.getContext('2d')
    if (!container || !canvas2d || !canvasGl || !ctx) return

    let reader: FrameReader | null = null
    let rafId: number | null = null
    let lastTime = 0

    const renderVisualization = (visualization: Visualization, frame: AudioFrame | null, delta: number) => {
      if (visualization.kind === '2d') {
        visualization.render(ctx, frame, delta)
        return
      }
      const gl = glRef.current
      if (gl && !glLostRef.current) visualization.render(gl, frame, delta)
    }

    const tick = (now: number) => {
      const visualization = visualizationRef.current
      if (!visualization) {
        rafId = null
        lastTime = 0
        return
      }
      const delta = lastTime ? Math.min(now - lastTime, MAX_DELTA_MS) : 1000 / 60
      lastTime = now

      if (!reader) {
        const analyser = engine.getAnalyser()
        if (analyser) reader = new FrameReader(analyser)
      }
      renderVisualization(visualization, reader ? reader.read(delta) : null, delta)

      if (!activeRef.current && visualization.isIdle()) {
        rafId = null
        lastTime = 0
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (rafId === null) rafId = requestAnimationFrame(tick)
    }

    /** Redesenha o estado atual sem avançar a animação (quando o loop está parado). */
    const redraw = () => {
      const visualization = visualizationRef.current
      if (rafId === null && visualization) renderVisualization(visualization, null, 0)
    }

    // Mede o contêiner (o canvas oculto mede 0) e dimensiona os dois canvases.
    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const pixelWidth = Math.max(1, Math.round(width * dpr))
      const pixelHeight = Math.max(1, Math.round(height * dpr))
      for (const canvas of [canvas2d, canvasGl]) {
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth
          canvas.height = pixelHeight
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { width, height, pixelWidth, pixelHeight }
      if (visualizationRef.current) resizeVisualization(visualizationRef.current, sizeRef.current)
      redraw()
    }

    // Perda de contexto (driver, GPU sob pressão): pausa o desenho WebGL e recria
    // os recursos do preset quando o navegador devolver o contexto.
    const onContextLost = (event: Event) => {
      event.preventDefault()
      glLostRef.current = true
    }
    const onContextRestored = () => {
      glLostRef.current = false
      const visualization = visualizationRef.current
      const gl = glRef.current
      if (visualization?.kind === 'webgl2' && gl) {
        try {
          visualization.init(gl)
          resizeVisualization(visualization, sizeRef.current)
          redraw()
        } catch (error) {
          console.error('[PulseScape] Falha ao restaurar preset WebGL:', error)
        }
      }
    }
    canvasGl.addEventListener('webglcontextlost', onContextLost)
    canvasGl.addEventListener('webglcontextrestored', onContextRestored)

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    wakeRef.current = wake
    redrawRef.current = redraw
    if (activeRef.current) wake()

    return () => {
      wakeRef.current = () => {}
      redrawRef.current = () => {}
      observer.disconnect()
      canvasGl.removeEventListener('webglcontextlost', onContextLost)
      canvasGl.removeEventListener('webglcontextrestored', onContextRestored)
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = null
    }
  }, [engine])

  useEffect(() => {
    activeRef.current = active
    if (active) wakeRef.current()
  }, [active])

  return (
    <div
      ref={containerRef}
      className="stage__canvases"
      role="img"
      aria-label={`Visualização “${getPreset(presetId).label}” reagindo ao áudio`}
    >
      <canvas ref={canvas2dRef} className="stage__canvas" aria-hidden="true" />
      <canvas ref={canvasGlRef} className="stage__canvas" aria-hidden="true" hidden />
    </div>
  )
}
