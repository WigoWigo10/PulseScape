import type { PlayerSnapshot, PlayerStatus } from '../audio/AudioEngine'
import { getExtension } from '../audio/fileValidation'
import { formatTime } from '../audio/format'

const STATUS_LABEL: Record<PlayerStatus, string> = {
  idle: 'Nenhum arquivo',
  loading: 'Carregando…',
  ready: 'Pronto para tocar',
  playing: 'Tocando',
  paused: 'Pausado',
  ended: 'Fim da faixa',
  error: 'Erro',
}

function trackTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

/** Faixa atual + indicador de status (região viva para leitores de tela). */
export function NowPlaying({ snapshot }: { snapshot: PlayerSnapshot }) {
  const { fileName, status, duration } = snapshot
  if (!fileName) return null

  const extension = getExtension(fileName).toUpperCase()
  const details = [extension, duration > 0 ? formatTime(duration) : null].filter(Boolean).join(' · ')

  return (
    <div className="now-playing">
      <span className={`now-playing__badge now-playing__badge--${status}`} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <div className="now-playing__text">
        <p className="now-playing__title" title={fileName}>
          {trackTitle(fileName)}
        </p>
        <p className="now-playing__meta">
          <span role="status" className={`now-playing__status now-playing__status--${status}`}>
            {STATUS_LABEL[status]}
          </span>
          {details && <span aria-hidden="true"> · {details}</span>}
          {snapshot.trackGainDb !== null && snapshot.trackGainDb > 0 && (
            <span
              className="now-playing__gain"
              title="Música baixa: reforço de visualização aplicado à faixa inteira. O som não é alterado."
            >
              {' · '}visual +{snapshot.trackGainDb.toLocaleString('pt-BR')} dB
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
