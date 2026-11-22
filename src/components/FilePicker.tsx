import { useRef, type ChangeEvent } from 'react'
import { FILE_INPUT_ACCEPT } from '../audio/fileValidation'
import { UploadIcon } from './icons'

interface FilePickerProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
  label?: string
  /** hero: botão grande do estado inicial; primary: destaque; secondary: discreto. */
  variant?: 'hero' | 'primary' | 'secondary'
}

/** Botão acessível que aciona o seletor nativo de arquivos (input oculto). */
export function FilePicker({
  onFileSelected,
  disabled = false,
  label = 'Selecionar áudio',
  variant = 'primary',
}: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Limpa o valor para permitir escolher o mesmo arquivo novamente.
    event.target.value = ''
    // Seleção cancelada: preserva o estado atual.
    if (file) onFileSelected(file)
  }

  return (
    <>
      <button
        type="button"
        className={`button button--${variant}`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        <UploadIcon />
        <span>{label}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
    </>
  )
}
