import { useRef, useState, type DragEvent } from 'react'
import { EmptyState } from './components/EmptyState'
import { FilePicker } from './components/FilePicker'
import { AlertIcon, PlayIcon, UploadIcon } from './components/icons'
import { NowPlaying } from './components/NowPlaying'
import { PlayerControls } from './components/PlayerControls'
import { PresetSwitcher } from './components/PresetSwitcher'
import { VisualizerCanvas } from './components/VisualizerCanvas'
import { useAudioEngine } from './hooks/useAudioEngine'
import { DEFAULT_PRESET, type PresetId } from './visualizations/registry'

const isFileDrag = (event: DragEvent) => event.dataTransfer.types.includes('Files')

export default function App() {
  const { engine, snapshot } = useAudioEngine()
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET)
  const [dragging, setDragging] = useState(false)
  // dragenter/dragleave disparam em cada filho; o contador evita piscar o overlay.
  const dragDepth = useRef(0)

  const hasFile = snapshot.fileName !== null
  const loadFile = (file: File) => engine?.load(file)

  const dragHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver: (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (event: DragEvent) => {
      if (!isFileDrag(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      // Processado localmente, como pelo seletor: nada é enviado pela rede.
      const file = event.dataTransfer.files[0]
      if (file) loadFile(file)
    },
  }

  return (
    <div className="app" {...dragHandlers}>
      <header className="app__header">
        <h1 className="app__title">PulseScape</h1>
        <div className="app__center">
          {hasFile && <PresetSwitcher value={presetId} onChange={setPresetId} />}
        </div>
        <div className="app__actions">
          {hasFile && <FilePicker onFileSelected={loadFile} disabled={!engine} variant="secondary" />}
        </div>
      </header>

      <main className={`stage stage--${snapshot.status}`} aria-label="Área de visualização">
        {engine && (
          <VisualizerCanvas engine={engine} presetId={presetId} active={snapshot.status === 'playing'} />
        )}

        {!hasFile && <EmptyState onFileSelected={loadFile} disabled={!engine} />}

        {(snapshot.status === 'ready' || snapshot.status === 'ended') && engine && (
          <button type="button" className="stage-play" onClick={() => void engine.play()}>
            <span className="stage-play__icon">
              <PlayIcon />
            </span>
            <span className="stage-play__label">{snapshot.status === 'ended' ? 'Tocar de novo' : 'Tocar'}</span>
          </button>
        )}

        {snapshot.status === 'loading' && (
          <div className="stage__pill" aria-hidden="true">
            <span className="spinner" />
            Carregando…
          </div>
        )}

        {snapshot.status === 'error' && (
          <section className="stage-card" role="alert">
            <span className="stage-card__icon">
              <AlertIcon />
            </span>
            <h2 className="stage-card__title">Não foi possível tocar este arquivo</h2>
            <p className="stage-card__text">{snapshot.errorMessage}</p>
            <FilePicker onFileSelected={loadFile} label="Escolher outro arquivo" />
          </section>
        )}

        {snapshot.notice && (
          <div className="toast" role="alert">
            <span>{snapshot.notice}</span>
            <button type="button" className="button button--ghost" onClick={() => engine?.dismissNotice()}>
              Fechar
            </button>
          </div>
        )}

        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            <UploadIcon />
            Solte o arquivo para carregar
          </div>
        )}
      </main>

      {hasFile && engine && (
        <footer className="app__footer">
          <div className="player">
            <NowPlaying snapshot={snapshot} />
            <PlayerControls
              snapshot={snapshot}
              onTogglePlay={() => engine.togglePlay()}
              onSeek={(t) => engine.seek(t)}
              onVolumeChange={(v) => engine.setVolume(v)}
            />
          </div>
        </footer>
      )}
    </div>
  )
}
