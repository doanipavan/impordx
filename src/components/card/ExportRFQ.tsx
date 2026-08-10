import { useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
import { Card } from '../../types'
import { CardItem } from '../../hooks/useCardItems'
import { Button } from '../ui/button'
import { formatDate } from '../../lib/utils'

interface ExportRFQProps {
  card: Card
  items: CardItem[]
  onClose: () => void
}

export function ExportRFQ({ card, items, onClose }: ExportRFQProps) {
  const [exporting, setExporting] = useState(false)

  async function exportExcel() {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      // Header info sheet
      const headerData = [
        ['RDX SUPPLIER HUB — REQUEST FOR QUOTATION'],
        [],
        ['Reference', card.ref_number ?? '—'],
        ['Title', card.title],
        ['Client', card.client_name ?? '—'],
        ['Collection', card.collection ?? '—'],
        ['Status', card.status],
        ['Priority', card.priority],
        ['Deadline', card.deadline ? formatDate(card.deadline) : '—'],
        ['Outside Material', card.outside_material ?? '—'],
        ['Inside Material', card.inside_material ?? '—'],
        ['Logo Color', card.logo_color ?? '—'],
        ['Logo Technique', card.logo_technique ?? '—'],
        ['RDX Code', card.reference_code ?? '—'],
        ['DEQI Ref', card.supplier_ref ?? '—'],
        ['Notes', card.description ?? '—'],
        [],
        ['Generated', new Date().toLocaleString()],
      ]

      const wsHeader = XLSX.utils.aoa_to_sheet(headerData)
      wsHeader['!cols'] = [{ wch: 20 }, { wch: 50 }]
      XLSX.utils.book_append_sheet(wb, wsHeader, 'Card Info')

      // Items sheet
      if (items.length > 0) {
        const itemRows = [
          ['INTERNAL REF', 'DESCRIPTION', 'SIZE', 'QTY', 'UNIT PRICE (USD)', 'NOTES'],
          ...items.map(i => [
            i.reference_code ?? '—',
            i.description ?? '—',
            i.size ?? '—',
            i.quantity,
            i.unit_price_usd ?? '',
            i.notes ?? '',
          ])
        ]
        const totalQty = items.reduce((s, i) => s + i.quantity, 0)
        const totalVal = items.reduce((s, i) => s + (i.quantity * (i.unit_price_usd ?? 0)), 0)
        itemRows.push(['', 'TOTAL', '', totalQty, totalVal > 0 ? totalVal : '', ''])

        const wsItems = XLSX.utils.aoa_to_sheet(itemRows)
        wsItems['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 30 }]
        XLSX.utils.book_append_sheet(wb, wsItems, 'Line Items')
      }

      XLSX.writeFile(wb, `RFQ_${card.ref_number ?? card.id.substring(0, 8)}_${card.client_name ?? 'client'}.xlsx`)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
      onClose()
    }
  }

  async function exportPDF() {
    setExporting(true)
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>RFQ ${card.ref_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #111; font-size: 13px; }
          h1 { font-size: 20px; color: #8b1a1a; margin-bottom: 4px; }
          .subtitle { color: #666; margin-bottom: 24px; font-size: 12px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin-bottom: 24px; }
          .field label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
          .field p { margin: 0; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background: #f5f5f5; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; border: 1px solid #ddd; }
          td { padding: 8px; border: 1px solid #ddd; font-size: 12px; }
          tr:last-child td { font-weight: bold; background: #fafafa; }
          .logo { color: #8b1a1a; font-weight: bold; font-size: 18px; margin-bottom: 4px; }
          .footer { margin-top: 32px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="logo">REDANTEX</div>
        <h1>Request for Quotation</h1>
        <div class="subtitle">Ref: ${card.ref_number ?? '—'} &nbsp;|&nbsp; ${formatDate(new Date().toISOString())}</div>

        <div class="grid">
          <div class="field"><label>Title</label><p>${card.title}</p></div>
          <div class="field"><label>Client</label><p>${card.client_name ?? '—'}</p></div>
          <div class="field"><label>Collection</label><p>${card.collection ?? '—'}</p></div>
          <div class="field"><label>Deadline</label><p>${card.deadline ? formatDate(card.deadline) : '—'}</p></div>
          <div class="field"><label>Outside Material</label><p>${card.outside_material ?? '—'}</p></div>
          <div class="field"><label>Inside Material</label><p>${card.inside_material ?? '—'}</p></div>
          <div class="field"><label>Logo Technique</label><p>${card.logo_technique ?? '—'}</p></div>
          <div class="field"><label>Logo Color</label><p>${card.logo_color ?? '—'}</p></div>
          <div class="field"><label>RDX Code</label><p>${card.reference_code ?? '—'}</p></div>
          <div class="field"><label>DEQI Ref</label><p>${card.supplier_ref ?? '—'}</p></div>
        </div>

        ${card.description ? `<div class="field"><label>Notes</label><p>${card.description}</p></div>` : ''}

        ${items.length > 0 ? `
        <table>
          <thead>
            <tr><th>Internal</th><th>Description</th><th>Size</th><th>Qty</th><th>Unit $ (USD)</th></tr>
          </thead>
          <tbody>
            ${items.map(i => `<tr>
              <td>${i.reference_code ?? '—'}</td>
              <td>${i.description ?? '—'}</td>
              <td>${i.size ?? '—'}</td>
              <td>${i.quantity}</td>
              <td>${i.unit_price_usd ? '$' + i.unit_price_usd : '—'}</td>
            </tr>`).join('')}
            <tr>
              <td colspan="3">TOTAL</td>
              <td>${items.reduce((s, i) => s + i.quantity, 0)}</td>
              <td>${items.reduce((s, i) => s + (i.quantity * (i.unit_price_usd ?? 0)), 0) > 0
                ? '$' + items.reduce((s, i) => s + (i.quantity * (i.unit_price_usd ?? 0)), 0).toFixed(2)
                : '—'}</td>
            </tr>
          </tbody>
        </table>` : ''}

        <div class="footer">Generated by impordx.netlify.app &nbsp;|&nbsp; ${new Date().toLocaleString()}</div>
      </body>
      </html>
    `
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print(); setExporting(false); onClose() }, 500)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-card rounded-xl shadow-modal border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Export RFQ</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Export this card as a formatted document to send to DEQI.
        </p>
        <div className="space-y-2">
          <Button className="w-full" onClick={exportExcel} loading={exporting}>
            <Download className="h-4 w-4" />
            Export as Excel (.xlsx)
          </Button>
          <Button variant="outline" className="w-full" onClick={exportPDF} loading={exporting}>
            <FileText className="h-4 w-4" />
            Export as PDF (print)
          </Button>
        </div>
      </div>
    </div>
  )
}
