/** Códigos de MediaError (constantes numéricas da especificação HTML). */
const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

export function describeMediaError(code: number | undefined): string {
  switch (code) {
    case MEDIA_ERR_ABORTED:
      return 'O carregamento do arquivo foi interrompido.'
    case MEDIA_ERR_NETWORK:
      return 'Não foi possível ler o arquivo.'
    case MEDIA_ERR_DECODE:
      return 'O arquivo parece corrompido ou usa uma codificação que este navegador não decodifica.'
    case MEDIA_ERR_SRC_NOT_SUPPORTED:
      // Navegadores também usam este código para arquivos corrompidos/ilegíveis.
      return 'Não foi possível abrir este arquivo: formato não suportado por este navegador ou arquivo corrompido.'
    default:
      return 'Erro desconhecido ao reproduzir o arquivo.'
  }
}
