import type { CSSProperties } from 'react'
import type { PlayerSnapshot } from '../audio/AudioEngine'
import { formatTime } from '../audio/format'
import { PauseIcon, PlayIcon, VolumeIcon } from './icons'

interface PlayerControlsProps {
  snapshot: PlayerSnapshot
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (volume: number) => void
}

/** Percentual preenchido do slider, consumido pelo CSS (--fill). */
const fillStyle = (ratio: number): CSSProperties =>
  ({ '--fill': `${Math.min(Math.max(ratio, 0), 1) * 100}%` }) as CSSProperties

export function PlayerControls({ snapshot, onTogglePlay, onSeek, onVolumeChange }: PlayerControlsProps) {
  const { status, duration, currentTime, volume } = snapshot
  const isPlaying = status === 'playing'
  const canPlay = status === 'ready' || status === 'playing' || status === 'paused' || status === 'ended'
  const canSeek = canPlay && duration > 0
  const position = Math.min(currentTime, duration || 0)

  return (
    <div className="controls">
      <button
        type="button"
        className={`play-button${isPlaying ? ' is-playing' : ''}`}
        onClick={onTogglePlay}
        disabled={!canPlay}
        aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon className="play-button__play" />}
      </button>

      <div className="controls__timeline">
        <span className="controls__time" aria-hidden="true">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          className="slider controls__progress"
          style={fillStyle(duration > 0 ? position / duration : 0)}
          min={0}
          max={duration || 0}
          step={0.1}
          value={position}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={!canSeek}
          aria-label="Posição da faixa"
          aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
        />
        <span className="controls__time" aria-hidden="true">
          {formatTime(duration)}
        </span>
      </div>

      <label className="controls__volume">
        <span className="visually-hidden">Volume</span>
        <VolumeIcon level={volume} className="controls__volume-icon" />
        <input
          type="range"
          className="slider"
          style={fillStyle(volume)}
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          aria-valuetext={`${Math.round(volume * 100)}%`}
        />
      </label>
    </div>
  )
}
