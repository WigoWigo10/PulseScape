import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { AudioEngine, INITIAL_SNAPSHOT, type PlayerSnapshot } from '../audio/AudioEngine'

/**
 * Cria uma instância do pipeline de áudio por montagem e a descarta no unmount.
 * Em StrictMode (dev) a instância descartada é substituída por uma nova, cada uma
 * com seu próprio <audio>, então nunca há duas fontes para o mesmo elemento.
 */
export function useAudioEngine(): { engine: AudioEngine | null; snapshot: PlayerSnapshot } {
  const [engine, setEngine] = useState<AudioEngine | null>(null)

  useEffect(() => {
    const instance = new AudioEngine()
    // Intencional: a instância é um recurso externo (áudio/AudioContext) com descarte no
    // cleanup; criá-la no render deixaria uma instância descartada viva em StrictMode.
    // oxlint-disable-next-line react/set-state-in-effect
    setEngine(instance)
    return () => instance.dispose()
  }, [])

  const subscribe = useCallback(
    (listener: () => void) => (engine ? engine.subscribe(listener) : () => {}),
    [engine],
  )
  const getSnapshot = useCallback(() => (engine ? engine.getSnapshot() : INITIAL_SNAPSHOT), [engine])

  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return { engine, snapshot }
}
