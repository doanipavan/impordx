/**
 * A superfície da biblioteca que escreve os emails do cliente.
 *
 * Existe para que o hub possa importar o **mesmo** construtor na prévia do
 * card. Uma prévia montada por outro código não é prévia: seria uma segunda
 * versão do email, parecida, divergindo no dia em que alguém mexesse num dos
 * dois — e o lugar onde a divergência apareceria é a caixa do cliente.
 *
 * Só declara o que o frontend usa. O resto do arquivo continua sendo chamado
 * de dentro das funções do Netlify, onde tipo não é cobrado.
 */

export interface ClientEmailItem {
  size?: string | null
  quantity?: number | null
}

export interface ClientEmailInput {
  stage?: string
  /** A etapa real do card, quando `stage` é um aviso avulso (lembrete, data). */
  currentStage?: string
  client?: string
  salesperson?: string
  items?: ClientEmailItem[]
  sampleApprovedOn?: string
  placedOn?: string
  productionOn?: string
  readyOn?: string
  collectedOn?: string
  shippedOn?: string
  arrivedOn?: string
  /** A âncora do plano: amostra aprovada, ou a confirmação quando não houve. */
  planFrom?: string
  today?: string
  logisticsDays?: number
  planDays?: number
}

export interface ClientEmail {
  subject: string
  html: string
  text: string
  /** Total de peças do pedido. */
  pieces: number
  /** O dia da chegada, `YYYY-MM-DD`, ou null quando não há âncora. */
  arrival: string | null
  /** Uma linha do que este aviso informou, gravada na fila no envio. */
  resumo: string
}

export declare function clientEmail(input: ClientEmailInput): ClientEmail

/** Traduz um card do banco para a entrada acima. */
export declare function cardToEmailInput(
  card: Record<string, unknown> | null | undefined,
  options: {
    stage?: string
    client?: string
    today?: string
    logisticsDays?: number
    planDays?: number
  },
): ClientEmailInput

export declare function arrivalDay(input: ClientEmailInput): string | null

export declare function decendio(plain?: string | null): {
  n: number; de: number; ate: number; mes: string; ano: number
  texto: string; faixa: string
} | null

export declare function longDay(plain?: string | null): string | null

/** As seis etapas que geram aviso de mudança de etapa. */
export declare const STAGES: string[]
