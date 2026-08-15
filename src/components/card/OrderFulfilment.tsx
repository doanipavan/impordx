import { useState } from 'react'
import { CalendarClock, FileText, Check, X, Pencil, AlertCircle } from 'lucide-react'
import { useSetDeliveryInfo, useUpdateCard } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Card } from '../../types'

// A delivery date is a calendar day, stored as a `date` and never parsed into an
// instant — that is what keeps it from sliding a day between São Paulo and DEQI.
function formatDeliveryDate(value?: string): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function OrderFulfilment({ card }: { card: Card }) {
  const { user } = useAuth()
  const setDeliveryInfo = useSetDeliveryInfo()
  const updateCard = useUpdateCard()
  const toast = useToast()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pi, setPi] = useState(card.pi_number ?? '')
  const [delivery, setDelivery] = useState(card.delivery_date ?? '')
  const [salesOrder, setSalesOrder] = useState(card.sales_order ?? '')
  const [purchaseOrder, setPurchaseOrder] = useState(card.purchase_order ?? '')

  // DEQI supplies the PI and the date; the Redantex order numbers are ours.
  const isDeqi = user?.role === 'viewer'
  const waiting = !card.pi_number || !card.delivery_date

  function startEditing() {
    setPi(card.pi_number ?? '')
    setDelivery(card.delivery_date ?? '')
    setSalesOrder(card.sales_order ?? '')
    setPurchaseOrder(card.purchase_order ?? '')
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await setDeliveryInfo.mutateAsync({ cardId: card.id, piNumber: pi, deliveryDate: delivery })
      if (!isDeqi) {
        // Empty string rather than undefined: supabase-js drops undefined keys,
        // so clearing a number would silently leave the old one in place.
        await updateCard.mutateAsync({
          id: card.id,
          sales_order: salesOrder.trim(),
          purchase_order: purchaseOrder.trim(),
        })
      }
      setEditing(false)
      toast('Order details saved', 'success')
    } catch (err) {
      console.error('Failed to save order details:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Failed to save: ${detail}` : 'Failed to save order details', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cnBox(waiting)}>
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className={waiting ? 'h-4 w-4 text-amber-600' : 'h-4 w-4 text-primary'} />
        <p className={waiting ? 'text-sm font-semibold text-amber-900' : 'text-sm font-semibold'}>Order Details</p>
        {waiting && !editing && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> WAITING ON DEQI
          </span>
        )}
        {!editing && (
          <button onClick={startEditing}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-accent">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">PI Number</label>
              <Input className="h-8 text-sm font-mono" value={pi} placeholder="PI-…"
                onChange={e => setPi(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Delivery Date</label>
              <Input className="h-8 text-sm" type="date" value={delivery}
                onChange={e => setDelivery(e.target.value)} />
            </div>
          </div>

          {!isDeqi && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Pedido de venda</label>
                <Input className="h-8 text-sm font-mono" value={salesOrder}
                  onChange={e => setSalesOrder(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Pedido de compra</label>
                <Input className="h-8 text-sm font-mono" value={purchaseOrder}
                  onChange={e => setPurchaseOrder(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} loading={saving}>
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="PI Number" mono value={card.pi_number} missing="Awaiting DEQI" />
          <Field label="Delivery Date" value={formatDeliveryDate(card.delivery_date)}
            missing={card.delivery_date ? undefined : 'Awaiting DEQI'} emphasis />
          <Field label="Pedido de venda" mono value={card.sales_order} />
          <Field label="Pedido de compra" mono value={card.purchase_order} />
        </div>
      )}
    </div>
  )
}

function cnBox(waiting: boolean) {
  return waiting
    ? 'rounded-lg border-2 border-amber-300 bg-amber-50/60 p-4'
    : 'rounded-lg border border-border bg-card p-4'
}

function Field({ label, value, missing, mono, emphasis }: {
  label: string
  value?: string
  missing?: string
  mono?: boolean
  emphasis?: boolean
}) {
  const empty = !value || value === '—'
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {label === 'PI Number' && <FileText className="h-3 w-3" />}
        {label}
      </p>
      {empty && missing ? (
        <p className="text-sm text-amber-700 font-medium">{missing}</p>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <p className={[
          emphasis ? 'text-base font-semibold' : 'text-sm font-medium',
          mono ? 'font-mono' : '',
        ].join(' ')}>{value}</p>
      )}
    </div>
  )
}
