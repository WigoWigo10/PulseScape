/** Ícones SVG inline (sem dependências). Decorativos: o rótulo fica no botão. */

interface IconProps {
  className?: string
}

/** Triângulo deslocado à direita: o centro óptico de um triângulo fica à esquerda da caixa. */
export function PlayIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M8.5 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7l-10.2-6.4A1 1 0 0 0 8.5 5.6Z" fill="currentColor" />
    </svg>
  )
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor" />
    </svg>
  )
}

export function WaveIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <path
        d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  )
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="1.3" fill="currentColor" />
    </svg>
  )
}

export function VolumeIcon({ level, className }: IconProps & { level: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 9.5v5a1 1 0 0 0 1 1h3l4.3 3.6a.8.8 0 0 0 1.3-.6V5.5a.8.8 0 0 0-1.3-.6L8 8.5H5a1 1 0 0 0-1 1Z" fill="currentColor" />
      {level === 0 ? (
        <path d="m17 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      ) : (
        <>
          <path d="M16.5 9a4.2 4.2 0 0 1 0 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          {level > 0.5 && (
            <path d="M19.2 6.4a8 8 0 0 1 0 11.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          )}
        </>
      )}
    </svg>
  )
}
