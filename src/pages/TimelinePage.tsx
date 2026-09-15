import { LOGISTICS_TARGET_DAYS, ORDER_LEG_DAYS } from '../lib/utils'
import { OrdersGantt } from '../components/board/OrdersGantt'
import { SupplierSwitch } from '../components/board/SupplierSwitch'
import { useAuth } from '../hooks/useAuth'

/**
 * The timeline on a page of its own.
 *
 * It lived above the Orders board until 15 Sep 2026, capped at 40% of the
 * height so the board underneath kept some room — which meant neither had
 * enough. Here it gets the whole page, and the board gets its own back.
 */
export function TimelinePage() {
  const { user } = useAuth()
  const supplier = user?.role === 'viewer'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-card shrink-0 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">{supplier ? 'Production schedule' : 'Timeline'}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {supplier
              ? `Every order against its ${ORDER_LEG_DAYS}-day production window`
              : `Every order on the ${ORDER_LEG_DAYS * 2}-day plan and the ${LOGISTICS_TARGET_DAYS}-day logistics target`}
          </p>
        </div>

        <div className="shrink-0 mr-44 flex items-center gap-2">
          {/* Same scope switch as the boards; renders nothing for a supplier login. */}
          <SupplierSwitch className="mr-1" />
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 flex flex-col">
        <OrdersGantt />
      </div>
    </div>
  )
}
