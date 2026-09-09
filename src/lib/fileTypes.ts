/**
 * O que pode ser anexado, num lugar só.
 *
 * Esta lista estava copiada em quatro arquivos — AttachmentPanel, CommentThread,
 * CreateCardModal e PiPanel — e as cópias já discordavam entre si. Além disso o
 * bucket tem a sua própria lista, no servidor: liberar aqui e esquecer lá produz
 * uma recusa que a tela não sabe explicar.
 *
 * Ao mexer nisto, mexa também na migração que atualiza `storage.buckets`.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const PDF_TYPE = 'application/pdf'

// Planilha. `application/vnd.ms-excel` é o .xls — e também o que o Windows com
// Excel instalado reporta para um .csv, por isso os dois casos caem aqui.
export const SHEET_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
  'text/csv',                                                          // .csv
]

// Planilha com macro é programa que roda ao abrir. Fica de fora por decisão, e
// a checagem é pela extensão porque o tipo declarado pelo navegador vem do
// sistema operacional e nem sempre distingue .xlsm de .xls.
const MACRO_EXTENSIONS = /\.(xlsm|xlsb|xltm|xlam)$/i

export const ACCEPTED_TYPES = [...IMAGE_TYPES, PDF_TYPE, ...VIDEO_TYPES, ...SHEET_TYPES]

// O `accept` do seletor de arquivos leva também as extensões: um .csv chega
// como text/plain em alguns sistemas, e sem isto ele apareceria apagado na
// janela mesmo sendo aceito.
export const ACCEPTED_ATTR = [...ACCEPTED_TYPES, '.xlsx', '.xls', '.csv'].join(',')

export const ACCEPTED_LABEL = 'JPG, PNG, WEBP, GIF, PDF, MP4, MOV, XLSX, XLS or CSV'

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
export const MAX_PDF_SIZE = 20 * 1024 * 1024
export const MAX_SHEET_SIZE = 20 * 1024 * 1024
// 50 MB é o teto do bucket, e vale para qualquer tipo — um número menor aqui só
// recusaria vídeo que o servidor aceitaria.
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024

export const isImageType = (t: string) => t.startsWith('image/')
export const isVideoType = (t: string) => t.startsWith('video/')
export const isSheetType = (t: string) => SHEET_TYPES.includes(t)

/** O tipo que vale, quando o navegador não sabe dizer. */
export function contentTypeOf(file: File): string {
  if (ACCEPTED_TYPES.includes(file.type)) return file.type
  if (/\.csv$/i.test(file.name)) return 'text/csv'
  if (/\.xlsx$/i.test(file.name)) return SHEET_TYPES[0]
  if (/\.xls$/i.test(file.name)) return SHEET_TYPES[1]
  return file.type
}

/**
 * Por que este arquivo não serve — ou null quando serve.
 *
 * Toda recusa tem de se nomear. "Failed to upload" já mandou alguém caçar
 * política e bucket por uma hora quando a resposta era o tipo do arquivo.
 */
export function fileRejection(file: File): string | null {
  if (MACRO_EXTENSIONS.test(file.name)) {
    return `"${file.name}" is a spreadsheet with macros — save it as .xlsx and try again`
  }
  if (ACCEPTED_TYPES.includes(contentTypeOf(file))) return null
  const kind = file.name.split('.').pop()?.toUpperCase() || 'This'
  return `${kind} files are not accepted — send ${ACCEPTED_LABEL}`
}

/** O teto deste arquivo, e como chamá-lo na mensagem de recusa. */
export function sizeLimitFor(type: string): { max: number; what: string } {
  if (isVideoType(type)) return { max: MAX_VIDEO_SIZE, what: 'videos' }
  if (isImageType(type)) return { max: MAX_IMAGE_SIZE, what: 'images' }
  if (isSheetType(type)) return { max: MAX_SHEET_SIZE, what: 'spreadsheets' }
  return { max: MAX_PDF_SIZE, what: 'PDFs' }
}
