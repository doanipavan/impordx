import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { BoardType, BOARD_COLUMNS, CardStatus, Priority } from '../../types'
import { useCreateCard } from '../../hooks/useCards'
import { useRedantexUsers } from '../../hooks/useUsers'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { Dialog, DialogBody, DialogFooter } from '../ui/dialog'
import { parseCardWorkbook, toCardFields, templateRows, ParsedSheet } from '../../lib/cardSheet'
import { cn } from '../../lib/utils'

// Orders are deliberately not importable. An order is only ever born by
// promoting a quote or a sample, which is what keeps one reference number
// running through a piece's whole life.

export function ImportCard({ board }: { board: BoardType }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Upload className="h-3.5 w-3.5" />
        Import
      </Button>
      {open && <ImportDialog board={board} onClose={() => setOpen(false)} />}
    </>
  )
}

function ImportDialog({ board, onClose }: { board: BoardType; onClose: () => void }) {
  const [parsed, setParsed] = useState<ParsedSheet | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [salespersonId, setSalespersonId] = useState('')
  const [salespersonName, setSalespersonName] = useState('')
  const [projectManagerId, setProjectManagerId] = useState('')
  const [dragging, setDragging] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const createCard = useCreateCard()
  const { data: people = [] } = useRedantexUsers()
  const { user } = useAuth()
  const toast = useToast()

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const { card, items } = templateRows()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(card)
    ws['!cols'] = [{ wch: 22 }, { wch: 44 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Card Info')
    const wsItems = XLSX.utils.aoa_to_sheet(items)
    wsItems['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 26 }]
    XLSX.utils.book_append_sheet(wb, wsItems, 'Line Items')
    XLSX.writeFile(wb, 'rdx-import-template.xlsx')
  }

  async function readFile(file: File) {
    setReading(true)
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      // cellDates so a real date comes back as a Date rather than a serial.
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      setParsed(parseCardWorkbook(wb as never, XLSX.utils as never))
    } catch (err) {
      console.error('Import parse failed:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Could not read the file: ${detail}` : 'Could not read the file', 'error')
      setParsed(null)
      setFileName('')
    } finally {
      setReading(false)
    }
  }

  async function handleCreate() {
    if (!parsed || parsed.errors.length > 0) return
    if (!projectManagerId) { toast('Pick who runs this card', 'error'); return }
    if (!salespersonId && !salespersonName.trim()) { toast('Name the salesperson', 'error'); return }

    setCreating(true)
    try {
      const card = await createCard.mutateAsync({
        board,
        status: BOARD_COLUMNS[board][0] as CardStatus,
        priority: 'medium' as Priority,
        salesperson_id: salespersonId || undefined,
        salesperson_name: salespersonId ? undefined : salespersonName.trim(),
        project_manager_id: projectManagerId,
        ...toCardFields(parsed),
      } as never)

      if (parsed.items.length > 0) {
        // One insert for the whole sheet: a partial import would leave a card
        // that looks complete and is not.
        const { error } = await supabase.from('card_items').insert(
          parsed.items.map((item, i) => ({
            card_id: card.id,
            reference_code: item.reference_code || null,
            description: item.description || null,
            size: item.size || null,
            quantity: item.quantity,
            unit_price_usd: item.unit_price_usd ?? null,
            sort_order: i,
          })))
        if (error) throw error
      }

      await supabase.from('activity_logs').insert({
        card_id: card.id,
        user_id: user!.id,
        action: 'imported',
        new_value: `${fileName} — ${parsed.items.length} line item(s)`,
      })

      toast(`${card.ref_number} created from ${fileName}`, 'success')
      onClose()
    } catch (err) {
      console.error('Import failed:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Import failed: ${detail}` : 'Import failed', 'error')
    } finally {
      setCreating(false)
    }
  }

  const blocked = !parsed || parsed.errors.length > 0
  const totalQty = parsed?.items.reduce((s, i) => s + i.quantity, 0) ?? 0

  return (
    <Dialog open onClose={onClose} size="lg" title={`Import into ${board}`}>
      <DialogBody className="space-y-4">

        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <FileSpreadsheet className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            The template is the same workbook <strong>Export RFQ</strong> produces, so you can
            export a card, edit it in Excel and bring it back. One file makes one card.
          </div>
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="shrink-0">
            Template
          </Button>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) readFile(file)
          }}
          onClick={() => fileRef.current?.click()}
          className={cn('rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40')}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }} />
          {reading ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading {fileName}…
            </span>
          ) : fileName ? (
            <span className="text-sm font-medium">{fileName}<br />
              <span className="text-xs text-muted-foreground font-normal">Click to choose another file</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              Drop an .xlsx here, or click to choose one
            </span>
          )}
        </div>

        {parsed && (
          <>
            {parsed.errors.map((e, i) => (
              <p key={i} className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />{e}
              </p>
            ))}
            {parsed.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2 text-xs text-amber-700">
                <Info className="h-3.5 w-3.5 mt-px shrink-0" />{w}
              </p>
            ))}

            {parsed.errors.length === 0 && (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-700" />
                    <span className="text-xs font-semibold">{parsed.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[parsed.client_name, parsed.collection].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto scrollbar-thin">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="text-left font-semibold px-3 py-1.5">Ref</th>
                          <th className="text-left font-semibold px-3 py-1.5">Description</th>
                          <th className="text-left font-semibold px-3 py-1.5">Size</th>
                          <th className="text-right font-semibold px-3 py-1.5">Qty</th>
                          <th className="text-right font-semibold px-3 py-1.5">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.items.map(item => (
                          <tr key={item.row} className="border-t border-border/60">
                            <td className="px-3 py-1.5 font-mono text-[11px]">{item.reference_code || '—'}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{item.description || '—'}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{item.size || '—'}</td>
                            <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{item.quantity}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {item.unit_price_usd != null ? `$${item.unit_price_usd.toFixed(3)}` : '—'}
                            </td>
                          </tr>
                        ))}
                        {parsed.items.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                            No line items in this file
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {parsed.items.length > 0 && (
                    <div className="px-3 py-1.5 bg-muted/30 text-xs text-right font-semibold tabular-nums">
                      {parsed.items.length} line(s) · {totalQty} pcs
                    </div>
                  )}
                </div>

                {/* People are picked here, not typed in the sheet — a name in a
                    cell cannot be matched to an account, and both are required. */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Salesperson
                    </label>
                    <Select value={salespersonId} onChange={e => setSalespersonId(e.target.value)}>
                      <option value="">Someone not listed…</option>
                      {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </Select>
                    {!salespersonId && (
                      <Input className="mt-1.5" placeholder="Type the name"
                        value={salespersonName} onChange={e => setSalespersonName(e.target.value)} />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Project manager
                    </label>
                    <Select value={projectManagerId} onChange={e => setProjectManagerId(e.target.value)}>
                      <option value="">Pick who runs it</option>
                      {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </Select>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={blocked} loading={creating}>
          {parsed && !blocked
            ? `Create card with ${parsed.items.length} item(s)`
            : 'Create card'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
