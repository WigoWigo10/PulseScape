import { FilePicker } from './FilePicker'
import { LockIcon, WaveIcon } from './icons'

interface EmptyStateProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

/** Tela inicial: explica o app e oferece o botão principal “Selecionar áudio”. */
export function EmptyState({ onFileSelected, disabled }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <div className="empty-state__orb" aria-hidden="true">
        <WaveIcon />
      </div>
      <h2 id="empty-state-title" className="empty-state__title">
        Dê forma ao seu som
      </h2>
      <p className="empty-state__text">
        Escolha uma música do seu computador — ou arraste o arquivo para cá — e veja-a ganhar vida em
        tempo real.
      </p>
      <FilePicker onFileSelected={onFileSelected} disabled={disabled} variant="hero" />
      <ul className="empty-state__meta">
        <li>
          <LockIcon />
          Processado só no seu navegador
        </li>
        <li>MP3 · WAV · OGG · FLAC · M4A</li>
      </ul>
    </section>
  )
}
