import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { salespersonLabel } from '../../types'

// One row per line item, with the order's own fields repeated on each — the
// shape you can filter, pivot and sum in Excel. A row per order would hide the
// items; a sheet per order would defeat the point of one file.
const HEADERS = [
  'Order', 'Status', 'Client', 'Collection',
  'Purchase order', 'Sales order', 'PI number',
  'Salesperson', 'Project manager',
  'Confirmed', 'Delivery date',
  'ERP (DEV)', 'Reference', 'Description', 'Size',
  'Qty', 'Unit USD', 'Line total USD',
]

interface Row { [key: string]: string | number | null }

export function ExportOrders({ statuses }: { statuses?: string[] }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function run() {
    setBusy(true)
    try {
      let query = supabase
        .from('cards')
        .select(`
          ref_number, status, client_name, collection, purchase_order, sales_order,
          pi_number, order_confirmed_at, delivery_date, salesperson_name,
          salesperson:users!cards_salesperson_id_fkey(full_name),
          project_manager:users!cards_project_manager_id_fkey(full_name),
          card_items(erp_code, reference_code, description, size, quantity, unit_price_usd, sort_order)
        `)
        .eq('board', 'orders')
        .eq('archived', false)
        .order('ref_number')

      if (statuses?.length) query = query.in('status', statuses)

      const { data, error } = await query
      if (error) throw error

      const rows: Row[] = []
      for (const card of data ?? []) {
        const c = card as Record<string, any>
        const base = {
          Order: c.ref_number ?? '',
          Status: c.status ?? '',
          Client: c.client_name ?? '',
          Collection: c.collection ?? '',
          'Purchase order': c.purchase_order ?? '',
          'Sales order': c.sales_order ?? '',
          'PI number': c.pi_number ?? '',
          Salesperson: salespersonLabel({
            salesperson: c.salesperson, salesperson_name: c.salesperson_name,
          }) ?? '',
          'Project manager': c.project_manager?.full_name ?? '',
          Confirmed: c.order_confirmed_at ?? '',
          'Delivery date': c.delivery_date ?? '',
        }

        const items = [...(c.card_items ?? [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

        // An order with no items still gets a row — otherwise it silently
        // vanishes from the export and nobody notices it was never filled in.
        if (items.length === 0) {
          rows.push({ ...base, 'ERP (DEV)': '', Reference: '', Description: '(no items)',
            Size: '', Qty: '', 'Unit USD': '', 'Line total USD': '' })
          continue
        }

        for (const item of items) {
          const qty = Number(item.quantity ?? 0)
          const unit = item.unit_price_usd != null ? Number(item.unit_price_usd) : null
          rows.push({
            ...base,
            'ERP (DEV)': item.erp_code ?? '',
            Reference: item.reference_code ?? '',
            Description: item.description ?? '',
            Size: item.size ?? '',
            Qty: qty,
            'Unit USD': unit,
            'Line total USD': unit != null ? Number((qty * unit).toFixed(2)) : null,
          })
        }
      }

      if (rows.length === 0) {
        toast('Nothing to export', 'info')
        return
      }

      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS })
      ws['!cols'] = HEADERS.map(h => ({ wch: h === 'Description' ? 34 : Math.max(11, h.length + 2) }))
      // Freeze the header so the order columns stay readable while scrolling.
      ws['!freeze'] = { xSplit: 0, ySplit: 1 }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Orders')

      const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
      XLSX.writeFile(wb, `redantex-orders-${stamp}.xlsx`)

      toast(`${rows.length} line(s) from ${data?.length ?? 0} order(s) exported`, 'success')
    } catch (err) {
      console.error('Order export failed:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Export failed: ${detail}` : 'Export failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Export
    </Button>
  )
}
