import { useMemo } from 'react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useSupplierFilter } from '../../hooks/useSupplierFilter'
import { useOrderItemRows } from '../../hooks/useOrderTotals'
import { boardTotals, arrivalsByMonth, OrderTotal } from '../../lib/orderTotals'
import { BoardType } from '../../types'
import { cn } from '../../lib/utils'

// Both sides of the trade in one place. The purchase price is what the supplier
// charged; the sale price is what the client pays, and it lives in a table the
// supplier cannot read at all (migration 025) — which is what makes showing it
// here safe, rather than merely hidden.
function usd(value: number) {
  return 'US$ ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function brl(value: number) {
  return 'R$ ' + value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function count(value: number) {
  return value.toLocaleString('en-US')
}

// The row labels differ because the boards mean different things at the same
// point: an order is committed once it is Placed, a sample once it is Approved.
const LABELS: Record<BoardType, { won: string; open: string; noun: string }> = {
  orders:  { won: 'Placed onward',  open: 'Not yet placed', noun: 'order' },
  samples: { won: 'Approved',       open: 'In progress',    noun: 'sample' },
  quotes:  { won: 'Confirmed',      open: 'Open',           noun: 'quote' },
}

export function BoardTotals({ board }: { board: BoardType }) {
  const { user } = useAuth()
  const { data: cards = [] } = useCards(board)
  const [supplierFilter] = useSupplierFilter()

  // Never for a supplier. Not hidden with zeroes, not greyed out — absent, so
  // there is nothing on screen to ask about.
  const isRedantex = user?.role === 'admin' || user?.role === 'member'

  const ids = useMemo(() => cards.map(c => c.id), [cards])
  const { data: rows = [] } = useOrderItemRows(ids, isRedantex)

  const totals = useMemo(
    () => boardTotals(board, cards, rows, supplierFilter),
    [board, cards, rows, supplierFilter]
  )
  // Só pedidos têm um dia 120. Calculado aqui, dos mesmos cards e das mesmas
  // linhas, para os dois painéis nunca discordarem sobre o que está sendo
  // contado — e para não abrir um segundo leitor do mesmo canal realtime, que
  // é o que já levou a página abaixo duas vezes.
  const arrivals = useMemo(
    () => board === 'orders' ? arrivalsByMonth(cards, rows, supplierFilter) : null,
    [board, cards, rows, supplierFilter]
  )

  if (!isRedantex) return null
  if (cards.length === 0) return null

  const labels = LABELS[board]
  const showLost = totals.lost.orders > 0

  const totalsPanel = (
    <div className="border border-border rounded-lg bg-card overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-semibold px-3 pt-2 pb-1">
              {board === 'orders' ? 'Orders' : board === 'samples' ? 'Samples' : 'Quotes'}
            </th>
            <th className="text-right font-semibold px-3 pt-2 pb-1">Pieces</th>
            <th className="text-right font-semibold px-3 pt-2 pb-1">Purchase</th>
            <th className="text-right font-semibold px-3 pt-2 pb-1">Sale</th>
          </tr>
        </thead>
        <tbody>
          <Row label={labels.won} noun={labels.noun} total={totals.won} />
          <Row label={labels.open} noun={labels.noun} total={totals.open} />
          <Row label="Total" noun={labels.noun} total={totals.total} emphasis />
          {/* Below the total, and outside it: money that fell through is not
              money at stake, and folding it in would inflate every figure. */}
          {showLost && <Row label="Lost" noun={labels.noun} total={totals.lost} muted />}
        </tbody>
      </table>
    </div>
  )

  if (!arrivals) {
    return <div className="mx-4 mb-3 shrink-0">{totalsPanel}</div>
  }

  // Em Orders o painel divide a largura com o de chegadas. Metade cada, e não
  // "o que sobrar": os dois têm o mesmo peso na leitura.
  return (
    <div className="mx-4 mb-3 shrink-0 grid grid-cols-1 xl:grid-cols-2 gap-3">
      {totalsPanel}
      <ArrivalsPanel arrivals={arrivals} />
    </div>
  )
}

/**
 * O que chega ao Brasil, mês a mês, em colunas.
 *
 * Meses em colunas e medidas em linhas — a mesma orientação do painel ao lado,
 * para os dois se lerem do mesmo jeito. Um card sem relógio aparece no rodapé
 * em vez de sumir: o total deste painel tem de bater com o número de pedidos
 * do outro, ou alguém vai passar uma tarde procurando o pedido que "faltou".
 */
export function ArrivalsPanel({ arrivals }: { arrivals: ReturnType<typeof arrivalsByMonth> }) {
  const { months, later, withoutClock, total } = arrivals
  if (months.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card px-3 py-3 text-xs text-muted-foreground">
        Arriving in Brazil — nothing on the clock yet
      </div>
    )
  }
  const cols = [...months.map(m => ({ label: m.label, total: m.total })),
                ...(later ? [{ label: 'Later', total: later }] : [])]

  const head = 'text-right font-semibold px-3 pt-2 pb-1 whitespace-nowrap'
  const cell = 'px-3 py-1.5 text-right align-top whitespace-nowrap'

  return (
    <div className="border border-border rounded-lg bg-card overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-semibold px-3 pt-2 pb-1">Arriving in Brazil</th>
            {cols.map(c => <th key={c.label} className={head}>{c.label}</th>)}
            <th className={cn(head, 'border-l border-border')}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-1.5 font-medium text-muted-foreground">Orders</td>
            {cols.map(c => <td key={c.label} className={cn(cell, 'font-semibold')}>{count(c.total.orders)}</td>)}
            <td className={cn(cell, 'font-semibold border-l border-border')}>{count(total.orders)}</td>
          </tr>
          <tr>
            <td className="px-3 py-1.5 font-medium text-muted-foreground">Pieces</td>
            {cols.map(c => <td key={c.label} className={cn(cell, 'font-semibold')}>{count(c.total.pieces)}</td>)}
            <td className={cn(cell, 'font-semibold border-l border-border')}>{count(total.pieces)}</td>
          </tr>
          <tr className="border-t border-border">
            <td className="px-3 py-1.5 font-bold">Purchase</td>
            {cols.map(c => (
              <td key={c.label} className={cn(cell, 'font-bold text-sm')}>
                <Figure value={usd(c.total.purchaseUsd)} covered={c.total.itemsWithPurchase} of={c.total.items} />
              </td>
            ))}
            <td className={cn(cell, 'font-bold text-sm border-l border-border')}>
              <Figure value={usd(total.purchaseUsd)} covered={total.itemsWithPurchase} of={total.items} />
            </td>
          </tr>
          <tr>
            <td className="px-3 py-1.5 font-bold">Sale</td>
            {cols.map(c => (
              <td key={c.label} className={cn(cell, 'font-bold text-sm')}>
                <Figure value={brl(c.total.saleBrl)} covered={c.total.itemsWithSale} of={c.total.items} />
              </td>
            ))}
            <td className={cn(cell, 'font-bold text-sm border-l border-border')}>
              <Figure value={brl(total.saleBrl)} covered={total.itemsWithSale} of={total.items} />
            </td>
          </tr>
          {withoutClock > 0 && (
            <tr className="border-t border-border/60">
              <td colSpan={cols.length + 2} className="px-3 py-1.5 text-[10px] text-amber-600">
                {withoutClock} {withoutClock === 1 ? 'order has' : 'orders have'} no clock yet — no sample approved, no proforma — and {withoutClock === 1 ? 'is' : 'are'} not counted above
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A figure whose coverage is partial says so.
 *
 * On Samples the supplier has usually not quoted yet — 18 of 24 line items
 * carry no purchase price. Printing the bare sum would read as the cost of the
 * board instead of the cost of six lines, and it would look precise while being
 * wrong by a factor of four.
 *
 * The word "partial" comes first on purpose: "6 of 24" alone was read as a
 * count of something rather than as a warning about the number above it. The
 * reader has to know the figure is incomplete before they read the figure.
 */
function Figure({ value, covered, of, emphasis }: {
  value: string
  covered: number
  of: number
  emphasis?: boolean
}) {
  const partial = of > 0 && covered < of
  return (
    <>
      <span className={cn(partial && covered === 0 && 'text-muted-foreground')}>{value}</span>
      {partial && (
        <span className={cn(
          'block text-[9px] font-normal leading-tight',
          covered === 0 ? 'text-muted-foreground/80' : 'text-amber-600'
        )}>
          partial · {covered} of {of}
        </span>
      )}
      {!partial && emphasis && <span className="block text-[9px] leading-tight">&nbsp;</span>}
    </>
  )
}

function Row({ label, noun, total, emphasis, muted }: {
  label: string
  noun: string
  total: OrderTotal
  emphasis?: boolean
  muted?: boolean
}) {
  const cell = cn('px-3 py-1.5 text-right align-top',
    emphasis ? 'font-bold text-sm' : 'font-semibold',
    muted && 'text-muted-foreground font-normal')

  return (
    <tr className={cn(emphasis && 'border-t border-border', muted && 'border-t border-border/60')}>
      <td className={cn('px-3 py-1.5 text-left align-top',
        emphasis ? 'font-bold text-foreground'
          : muted ? 'font-medium text-muted-foreground'
          : 'font-medium text-muted-foreground')}>
        {label}
        <span className="block text-[9px] font-normal text-muted-foreground/80 leading-tight">
          {total.orders} {total.orders === 1 ? noun : noun + 's'}
        </span>
      </td>
      <td className={cell}>{count(total.pieces)}</td>
      <td className={cell}>
        <Figure value={usd(total.purchaseUsd)} covered={total.itemsWithPurchase} of={total.items} emphasis={emphasis} />
      </td>
      {/* Money in, in the green this app already uses for a card's value. */}
      <td className={cn(cell, !muted && 'text-green-600')}>
        <Figure value={brl(total.saleBrl)} covered={total.itemsWithSale} of={total.items} emphasis={emphasis} />
      </td>
    </tr>
  )
}
