import { useMemo } from 'react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useSupplierFilter } from '../../hooks/useSupplierFilter'
import { useOrderItemRows } from '../../hooks/useOrderTotals'
import { boardTotals, OrderTotal } from '../../lib/orderTotals'
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

  if (!isRedantex) return null
  if (cards.length === 0) return null

  const labels = LABELS[board]
  const showLost = totals.lost.orders > 0

  return (
    <div className="mx-4 mb-3 border border-border rounded-lg bg-card overflow-x-auto shrink-0">
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
