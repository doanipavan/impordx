import { useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
import { Card } from '../../types'
import { CardItem } from '../../hooks/useCardItems'
import { Button } from '../ui/button'
import { useToast } from '../ui/toast'
import { formatDate } from '../../lib/utils'
import { CATALOG } from '../../lib/catalog'
import { getSignedUrl } from '../../hooks/useAttachments'

const isImageName = (name?: string) => /\.(jpe?g|png|webp|gif)$/i.test(name ?? '')

// The print window loads from a blank document, so a remote URL can easily lose
// the race with print(). Inlining the bytes makes the sheet self-contained.
async function inlineImage(path: string): Promise<string | null> {
  try {
    const url = await getSignedUrl(path)
    const blob = await (await fetch(url)).blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null   // fall through to the catalogue picture
  }
}

interface ExportRFQProps {
  card: Card
  items: CardItem[]
  onClose: () => void
}

function f(v?: string | null) { return v || '—' }

export function ExportRFQ({ card, items, onClose }: ExportRFQProps) {
  const [exporting, setExporting] = useState(false)
  const toast = useToast()

  async function exportExcel() {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      const rows: (string | number)[][] = [
        ['RDX SUPPLIER HUB — REQUEST FOR QUOTATION'],
        [`Ref: ${f(card.ref_number)}`, '', `Date: ${formatDate(new Date().toISOString())}`],
        [],
        ['PRODUCT SPECIFICATIONS'],
        ['Title', f(card.title)],
        ['Client', f(card.client_name)],
        ['Collection', f(card.collection)],
        ['Deadline', card.deadline ? formatDate(card.deadline) : '—'],
        ['Description', f(card.description)],
        [],
        ['OUTSIDE MATERIAL'],
        ['Material', f(card.outside_material)],
        [],
        ['INSIDE MATERIAL'],
        ['Material', f(card.inside_material)],
        [],
        ['OUTSIDE LOGO'],
        ['Technique', f(card.logo_technique_outside)],
        ['Text', f(card.logo_text_outside)],
        ['Color', f(card.logo_color_outside)],
        [],
        ['INSIDE LOGO'],
        ['Technique', f(card.logo_technique_inside)],
        ['Text', f(card.logo_text_inside)],
        ['Color', f(card.logo_color_inside)],
      ]

      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Card Info')

      if (items.length > 0) {
        const itemRows = [
          ['INTERNAL REF', 'DESCRIPTION', 'SIZE', 'QTY', 'UNIT PRICE (USD)', 'REFERENCE FILE'],
          ...items.map(i => [f(i.reference_code), f(i.description), f(i.size), i.quantity, i.unit_price_usd != null ? i.unit_price_usd.toFixed(3) : '', f(i.file_name)]),
        ]
        const totalQty = items.reduce((s, i) => s + i.quantity, 0)
        const totalVal = items.reduce((s, i) => s + (i.quantity * (i.unit_price_usd ?? 0)), 0)
        itemRows.push(['', 'TOTAL', '', totalQty, totalVal > 0 ? totalVal : '', ''])
        const wsItems = XLSX.utils.aoa_to_sheet(itemRows)
        wsItems['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 28 }]
        XLSX.utils.book_append_sheet(wb, wsItems, 'Line Items')
      }

      XLSX.writeFile(wb, `RFQ_${f(card.ref_number)}_${f(card.client_name)}.xlsx`)
    } finally { setExporting(false); onClose() }
  }

  async function exportPDF() {
    setExporting(true)
    const baseUrl = window.location.origin

    // Opened before the await so the browser still credits the click and does
    // not treat the window as an unsolicited popup.
    const win = window.open('', '_blank')

    // An uploaded reference outranks the catalogue picture: it is the artwork
    // for this specific line, not the generic insert.
    const uploaded = new Map<string, string>()
    await Promise.all(items
      .filter(i => i.file_url && isImageName(i.file_name))
      .map(async i => {
        const data = await inlineImage(i.file_url!)
        if (data) uploaded.set(i.id, data)
      }))

    // An uploaded drawing carries instructions a catalogue icon does not, so
    // when the sheet has one the whole column grows to keep it readable.
    const hasArtwork = uploaded.size > 0
    const box = hasArtwork ? 104 : 48

    const itemsRows = items.map(item => {
      const cat = CATALOG.find(c => c.code.toLowerCase() === (item.reference_code ?? '').toLowerCase())
      const imgSrc = uploaded.get(item.id) ?? (cat ? `${baseUrl}${cat.image}` : null)
      const attachedPdf = item.file_name && !isImageName(item.file_name) ? item.file_name : null
      return `
        <tr>
          <td style="text-align:center;padding:6px">
            ${imgSrc
              ? `<img src="${imgSrc}" style="width:${box}px;height:${box}px;object-fit:contain;border:1px solid #eee;border-radius:4px;padding:2px;background:#fff" /><br><span style="font-size:10px;font-weight:600;word-break:break-word">${item.reference_code ?? ''}</span>`
              : `<div style="width:${box}px;height:${box}px;border:1px dashed #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999;margin:auto">?</div><br><span style="font-size:10px;word-break:break-word">${item.reference_code ?? 'Custom'}</span>`
            }
          </td>
          <td style="padding:6px">${f(item.description)}${attachedPdf ? `<div style="font-size:9px;color:#666;margin-top:2px">Attached: ${attachedPdf}</div>` : ''}</td>
          <td style="padding:6px;text-align:center">${f(item.size)}</td>
          <td style="padding:6px;text-align:center;font-weight:600">${item.quantity}</td>
          <td style="padding:6px;text-align:center">${item.unit_price_usd != null ? '$' + item.unit_price_usd.toFixed(3) : '—'}</td>
        </tr>`
    }).join('')

    const totalQty = items.reduce((s, i) => s + i.quantity, 0)
    const totalVal = items.reduce((s, i) => s + (i.quantity * (i.unit_price_usd ?? 0)), 0)

    const section = (title: string, rows: [string, string][]) => `
      <div class="section">
        <div class="section-title">${title}</div>
        <div class="grid">
          ${rows.filter(([,v]) => v && v !== '—').map(([l, v]) => `
            <div class="field"><div class="label">${l}</div><div class="value">${v}</div></div>
          `).join('')}
        </div>
      </div>`

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>RFQ ${f(card.ref_number)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; padding: 32px; color: #111; font-size: 13px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #8b1a1a; padding-bottom: 12px; }
      .brand { font-size: 22px; font-weight: bold; color: #8b1a1a; }
      .ref { font-size: 12px; color: #666; margin-top: 4px; }
      .meta { text-align: right; font-size: 12px; color: #555; }
      .section { margin-bottom: 16px; }
      .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #8b1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; margin-bottom: 8px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
      .field .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .3px; }
      .field .value { font-weight: 600; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      th { background: #f5f5f5; text-align: left; padding: 7px 8px; font-size: 11px; text-transform: uppercase; border: 1px solid #ddd; color: #555; }
      td { padding: 6px 8px; border: 1px solid #ddd; vertical-align: middle; }
      .total-row td { font-weight: bold; background: #fafafa; }
      .footer { margin-top: 24px; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; display: flex; justify-content: space-between; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <div class="header">
      <div>
        <div class="brand">REDANTEX</div>
        <div class="ref">REQUEST FOR QUOTATION &nbsp;|&nbsp; ${f(card.ref_number)}</div>
      </div>
      <div class="meta">
        ${card.client_name ? `<div><strong>${card.client_name}</strong></div>` : ''}
        <div>${formatDate(new Date().toISOString())}</div>
        ${card.deadline ? `<div>Deadline: ${formatDate(card.deadline)}</div>` : ''}
      </div>
    </div>

    ${section('Product Specifications', [
      ['Collection', f(card.collection)],
      ['Quantity', card.quantity ? `${card.quantity} pcs` : '—'],
      ['Description', f(card.description)],
    ])}

    ${section('Outside Material', [
      ['Material', f(card.outside_material)],
    ])}

    ${section('Inside Material', [
      ['Material', f(card.inside_material)],
    ])}

    ${(card.logo_technique_outside || card.logo_text_outside || card.logo_color_outside) ? section('Outside Logo', [
      ['Technique', f(card.logo_technique_outside)],
      ['Text / Brand', f(card.logo_text_outside)],
      ['Color', f(card.logo_color_outside)],
    ]) : ''}

    ${(card.logo_technique_inside || card.logo_text_inside || card.logo_color_inside) ? section('Inside Logo', [
      ['Technique', f(card.logo_technique_inside)],
      ['Text / Brand', f(card.logo_text_inside)],
      ['Color', f(card.logo_color_inside)],
    ]) : ''}

    ${items.length > 0 ? `
    <div class="section">
      <div class="section-title">Internals (Line Items)</div>
      <table>
        <thead><tr>
          <th style="width:${box + 26}px;text-align:center">Internal</th>
          <th>Description</th>
          <th style="width:90px;text-align:center">Size</th>
          <th style="width:60px;text-align:center">Qty</th>
          <th style="width:100px;text-align:center">Unit $ (USD)</th>
        </tr></thead>
        <tbody>
          ${itemsRows}
          <tr class="total-row">
            <td colspan="3" style="text-align:right;padding:7px 8px">TOTAL</td>
            <td style="text-align:center">${totalQty}</td>
            <td style="text-align:center">${totalVal > 0 ? '$' + totalVal.toFixed(2) : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>` : ''}

    <div class="footer">
      <span>impordx.netlify.app</span>
      <span>Generated ${new Date().toLocaleString()}</span>
    </div>
    </body></html>`

    if (win) {
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print(); setExporting(false); onClose() }, 800)
    } else {
      // Popup blocked — without this the button spins forever.
      setExporting(false)
      toast('Allow pop-ups for this site to export the PDF', 'error')
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
        <p className="text-sm text-muted-foreground mb-5">Export this card as a formatted document to send to DEQI.</p>
        <div className="space-y-2">
          <Button className="w-full" onClick={exportExcel} loading={exporting}>
            <Download className="h-4 w-4" /> Export as Excel (.xlsx)
          </Button>
          <Button variant="outline" className="w-full" onClick={exportPDF} loading={exporting}>
            <FileText className="h-4 w-4" /> Export as PDF (print)
          </Button>
        </div>
      </div>
    </div>
  )
}
