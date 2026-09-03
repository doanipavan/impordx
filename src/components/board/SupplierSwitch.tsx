import { cn, supplierAccent } from '../../lib/utils'
import { useSupplierFilter, useSuppliers } from '../../hooks/useSupplierFilter'

/**
 * The supplier scope, above the funnel — where the scope of a page is read
 * before its contents.
 *
 * It renders nothing at all when there is only one supplier to choose from,
 * which is the case for every supplier account: they get one row back from the
 * suppliers table, so there is nothing to switch between and no hint that
 * anyone else exists.
 */
export function SupplierSwitch({ className }: { className?: string }) {
  const { data: suppliers = [] } = useSuppliers()
  const [filter, setFilter] = useSupplierFilter()

  if (suppliers.length < 2) return null

  const options = [{ id: 'all', short_name: 'All suppliers' }, ...suppliers]

  return (
    <div
      role="group"
      aria-label="Supplier"
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5', className)}
    >
      {options.map((s) => {
        const on = filter === s.id
        const accent = s.id === 'all' ? null : supplierAccent(s.short_name)
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            onClick={() => setFilter(s.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
              on
                ? 'bg-card font-semibold text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-sm shrink-0', accent ? accent.dot : 'bg-gradient-to-br from-sky-600 to-emerald-600')}
              aria-hidden="true"
            />
            {s.short_name}
          </button>
        )
      })}
    </div>
  )
}
