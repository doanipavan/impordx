import { useMemo } from 'react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useSupplierFilter } from '../../hooks/useSupplierFilter'
import { useOrderItemRows } from '../../hooks/useOrderTotals'
import { orderTotals, OrderTotal } from '../../lib/orderTotals'
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

export function OrderTotals() {
  const { user } = useAuth()
  const { data: cards = [] } = useCards('orders')
  const [supplierFilter] = useSupplierFilter()

  // Never for a supplier. Not hidden with zeroes, not greyed out — absent, so
  // there is nothing on screen to ask about.
  const isRedantex = user?.role === 'admin' || user?.role === 'member'

  const ids = useMemo(() => cards.map(c => c.id), [cards])
  const { data: rows = [] } = useOrderItemRows(ids, isRedantex)

  const totals = useMemo(
    () => orderTotals(cards, rows, supplierFilter),
    [cards, rows, supplierFilter]
  )

  if (!isRedantex) return null
  if (cards.length === 0) return null

  return (
    <div className="mx-4 mb-3 border border-border rounded-lg bg-card overflow-x-auto shrink-0">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-semibold px-3 pt-2 pb-1">Orders</th>
            <th className="text-right font-semibold px-3 pt-2 pb-1">Pieces</th>
            <th className="text-right font-semibold px-3 pt-2 pb-1">Purchase</th>
            <th className="text-right font-semibold px-3 pt-2 pb-1">Sale</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Placed onward" total={totals.placed} />
          <Row label="Not yet placed" total={totals.pending} />
          <Row label="Total" total={totals.total} emphasis />
        </tbody>
      </table>
    </div>
  )
}

function Row({ label, total, emphasis }: { label: string; total: OrderTotal; emphasis?: boolean }) {
  return (
    <tr className={cn(emphasis && 'border-t border-border')}>
      <td className={cn('px-3 py-1.5 text-left', emphasis ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>
        {label}
        <span className="block text-[9px] font-normal text-muted-foreground/80 leading-tight">
          {total.orders} {total.orders === 1 ? 'order' : 'orders'}
        </span>
      </td>
      <td className={cn('px-3 py-1.5 text-right', emphasis ? 'font-bold text-sm' : 'font-semibold')}>
        {count(total.pieces)}
      </td>
      <td className={cn('px-3 py-1.5 text-right', emphasis ? 'font-bold text-sm' : 'font-semibold')}>
        {usd(total.purchaseUsd)}
      </td>
      {/* Money in, in the green this app already uses for a card's value. */}
      <td className={cn('px-3 py-1.5 text-right text-green-600', emphasis ? 'font-bold text-sm' : 'font-semibold')}>
        {brl(total.saleBrl)}
      </td>
    </tr>
  )
}
