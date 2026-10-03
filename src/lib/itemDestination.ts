/**
 * Para onde vai cada produto do pedido: o estoque da Redantex ou um cliente.
 *
 * Mora no item e não no card porque um pedido mistura — o ORD-2026-10045 tem
 * quatro produtos diferentes numa coisa só. Quem resume é o card, e o resumo
 * vive aqui para que a tabela, a faixa do painel e o card do quadro contem a
 * mesma história. Três lugares com a sua própria conta é como duas telas
 * acabam discordando sobre o mesmo pedido.
 *
 * `null` é um estado legítimo: quer dizer "ninguém escolheu ainda". Cotações e
 * amostras começam assim de propósito; só os itens que já estavam em pedido
 * foram preenchidos (migração 050).
 *
 * A cor é azul por eliminação. Neste hub cinza é espera, âmbar é andando,
 * verde é concluído e vermelho é atraso — uma etiqueta de destino em verde
 * leria como "pronto".
 */

export type Destination = 'stock' | 'client'

export const DESTINATIONS: Destination[] = ['client', 'stock']

/** O rótulo é inglês como o resto da interface; o fornecedor lê esta tela. */
export const DESTINATION_LABEL: Record<Destination, string> = {
  client: 'Client',
  stock: 'Stock',
}

export const DESTINATION_CHIP: Record<Destination, string> = {
  client: 'border-border bg-card text-slate-600',
  stock: 'border-indigo-200 bg-indigo-50 text-indigo-700',
}

export interface DestinationSummary {
  stock: number
  client: number
  /** Itens que ninguém classificou ainda. */
  unset: number
  /** O destino único, quando todos os itens classificados concordam. */
  only: Destination | null
  /** Tem pelo menos um item de estoque — é o que vale a pena mostrar no quadro. */
  hasStock: boolean
  /** Classificados, e não todos iguais. */
  mixed: boolean
}

export function destinationSummary(
  items: Array<{ destination?: Destination | null }>,
): DestinationSummary {
  const stock = items.filter(i => i.destination === 'stock').length
  const client = items.filter(i => i.destination === 'client').length
  const unset = items.length - stock - client

  // Um pedido sem nenhum item classificado não tem destino — e não é o mesmo
  // que um pedido de cliente. Dizer "Client" aí seria inventar uma resposta.
  const only = stock > 0 && client === 0 ? 'stock'
    : client > 0 && stock === 0 ? 'client'
      : null

  return { stock, client, unset, only, hasStock: stock > 0, mixed: stock > 0 && client > 0 }
}
