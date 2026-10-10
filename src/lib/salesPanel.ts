import { Card } from '../types'
import { orderSchedule } from './utils'
import { contiguousMonths } from './orderTotals'

/**
 * O painel de vendas: cada pedido no mês em que chega ao Brasil.
 *
 * O mês vem de `orderSchedule`, nunca de uma conta própria. O CLAUDE.md é
 * explícito sobre isso e tem razão de ser: o Gantt e o painel do card já
 * calcularam "+120" cada um por sua conta uma vez, e dois pedidos vivos
 * sumiram do gráfico enquanto o card ainda os mostrava. Aqui se lê o mesmo
 * número que a timeline lê.
 *
 * Esta tela é a única do hub escrita em português, e de propósito: é para os
 * vinte e cinco vendedores da Redantex, não para o fornecedor, que não tem
 * linha nenhuma aqui. Toda a interface do hub segue em inglês.
 */

export interface SalesRow {
  card: Card
  /** `YYYY-MM` do mês de chegada. */
  month: string
  /** `YYYY-MM-DD` — o dia que chegou, ou o previsto. */
  arrival: string
  /** Já está no Brasil. */
  landed: boolean
  salesperson: string
  client: string
  value: number
}

export interface SalesMonth {
  key: string
  rows: SalesRow[]
  total: number
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** `2027-01` → `Janeiro 2027`. */
export function monthName(key: string): string {
  const m = Number(key.slice(5, 7))
  if (!m || m < 1 || m > 12) return key
  const nome = MESES[m - 1]
  return nome.charAt(0).toUpperCase() + nome.slice(1) + ' ' + key.slice(0, 4)
}

/**
 * A faixa de dez dias que o cliente ouve, do terço do mês em que a previsão
 * cai. A mesma conta de `decendio` em `netlify/lib/clientEmail.mjs` — o email
 * não pode importar daqui nem este arquivo de lá, então
 * `scripts/check-sales-panel.ts` compara as duas em cima das mesmas datas e
 * falha se discordarem.
 */
export function forecastBand(plain?: string | null): string | null {
  if (!plain) return null
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const de = d <= 10 ? 1 : d <= 20 ? 11 : 21
  const ate = d <= 10 ? 10 : d <= 20 ? 20 : ultimo
  // A frase inteira, palavra por palavra como o cliente a recebeu. Devolver
  // só "11 a 20" convidava quem chama a escrever "entre" na frente, e foi o
  // que aconteceu nas duas telas: "chegada entre 11 a 20 de janeiro".
  return `entre ${de} e ${ate} de ${MESES[m - 1]} de ${y}`
}

/** `2026-11-25` → `25 nov 2026`. Dia de calendário, nunca um instante. */
export function shortDay(plain?: string | null): string {
  if (!plain) return '—'
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  const curto = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${d} ${curto[m - 1]} ${y}`
}

/** `2027-01-14` → `14 de janeiro de 2027`. */
export function longDay(plain?: string | null): string | null {
  if (!plain) return null
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return `${d} de ${MESES[m - 1]} de ${y}`
}

/** Os pedidos que contam, cada um com o mês em que chega. */
export function salesRows(cards: Card[]): SalesRow[] {
  const rows: SalesRow[] = []
  for (const card of cards) {
    // Perdido não é venda, e arquivado saiu de cena.
    if (card.archived || card.status === 'Lost') continue
    const schedule = orderSchedule(card)
    // Sem âncora não há previsão: um pedido que ainda não tem amostra
    // aprovada nem confirmação não sabe em que mês cai, e inventar um mês
    // para ele seria pior que deixá-lo de fora.
    if (!schedule) continue
    const arrival = schedule.arrivedAt ?? schedule.arrival
    rows.push({
      card,
      arrival,
      month: arrival.slice(0, 7),
      landed: !!schedule.arrivedAt,
      salesperson: card.salesperson_name?.trim() || card.salesperson?.full_name || '—',
      client: card.client_name?.trim() || '—',
      value: Number(card.value_brl ?? 0),
    })
  }
  return rows.sort((a, b) =>
    a.arrival.localeCompare(b.arrival) || a.client.localeCompare(b.client, 'pt-BR'))
}

/**
 * Agrupa por mês, sem pular os meses vazios do meio.
 *
 * O vazio é informação: hoje vinte e oito dos trinta e seis pedidos caem em
 * dezembro, e é justamente a comparação com os meses magros ao lado que
 * mostra a parede.
 */
export function salesMonths(rows: SalesRow[]): SalesMonth[] {
  const by = new Map<string, SalesRow[]>()
  for (const r of rows) by.set(r.month, [...(by.get(r.month) ?? []), r])

  return contiguousMonths([...by.keys()]).map((key) => {
    const monthRows = by.get(key) ?? []
    return {
      key,
      rows: monthRows,
      total: monthRows.reduce((s, r) => s + r.value, 0),
    }
  })
}

/** Os vendedores que têm pedido no recorte, para os botões do filtro. */
export function salespeopleIn(rows: SalesRow[]): string[] {
  return [...new Set(rows.map((r) => r.salesperson))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export const brl = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
export const pecas = (v: number) => Number(v ?? 0).toLocaleString('pt-BR')
