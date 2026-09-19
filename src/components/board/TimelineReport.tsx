import { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useSupplierFilter, useSuppliers } from '../../hooks/useSupplierFilter'
import { Row, buildRow, sortRows, todayInSaoPaulo } from '../../lib/orderRows'
import {
  ReportFilter, DEFAULT_FILTER, STAGE_GROUPS, StageGroup,
  applyReportFilter, describeFilter, monthLabel, rowMonth, timelineReportHtml,
} from '../../lib/timelineReport'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../ui/dialog'
import { Select } from '../ui/select'
import { useToast } from '../ui/toast'

// O logo entra na página como bytes: a janela de impressão nasce em branco e
// uma imagem remota perde a corrida para o print(). Mesma razão do ExportRFQ.
async function inlineLogo(): Promise<string | null> {
  try {
    const blob = await (await fetch('/logo.webp')).blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

/**
 * O botão "Report (PDF)" da aba Timeline e a caixa de filtros que ele abre.
 *
 * Os filtros são aplicados às mesmas linhas que o gráfico desenha, e a caixa
 * diz quantas sobraram antes de gerar — um PDF vazio, ou com 31 páginas quando
 * se queria um cliente, é descoberto aqui e não na impressora.
 */
export function TimelineReport() {
  const { data: cards = [] } = useCards('orders')
  const { data: suppliers = [] } = useSuppliers()
  const { user } = useAuth()
  const [pageFilter] = useSupplierFilter()
  const toast = useToast()
  const deqiOnly = user?.role === 'viewer'

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<ReportFilter>(DEFAULT_FILTER)

  const today = useMemo(() => todayInSaoPaulo(), [])
  const rows = useMemo(
    () => sortRows(cards.map(c => buildRow(c, today)).filter((r): r is Row => r !== null), deqiOnly),
    [cards, today, deqiOnly],
  )

  // As opções saem do que existe: um cliente que não tem pedido na régua não
  // aparece, e um mês que nenhum pedido alcança também não.
  const clients = useMemo(
    () => Array.from(new Set(rows.map(r => r.card.client_name).filter((c): c is string => !!c))).sort(),
    [rows])
  const months = useMemo(
    () => Array.from(new Set(rows.map(r => rowMonth(r, deqiOnly)))).sort(),
    [rows, deqiOnly])

  const matched = useMemo(() => applyReportFilter(rows, filter, deqiOnly), [rows, filter, deqiOnly])

  function openDialog() {
    // Abre com o filtro de fornecedor que já está ligado na tela: é o que a
    // pessoa está olhando, então é o que ela espera imprimir.
    setFilter({ ...DEFAULT_FILTER, supplier: pageFilter })
    setOpen(true)
  }

  const set = <K extends keyof ReportFilter>(k: K, v: ReportFilter[K]) => setFilter(f => ({ ...f, [k]: v }))
  const toggleStage = (id: StageGroup) =>
    set('stages', filter.stages.includes(id) ? filter.stages.filter(s => s !== id) : [...filter.stages, id])

  async function generate() {
    setBusy(true)
    // Aberta antes do await, senão o navegador não credita o clique e bloqueia.
    const win = window.open('', '_blank')
    const logo = await inlineLogo()
    const supplierName = suppliers.find(s => s.id === filter.supplier)?.short_name
    const generatedAt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date()) + ' BRT'

    const html = timelineReportHtml(matched, {
      today, deqiOnly,
      scope: describeFilter(filter, supplierName, deqiOnly),
      generatedBy: user?.full_name ?? '',
      generatedAt,
      logoDataUrl: logo,
      sections: filter.sections,
    })

    if (win) {
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print(); setBusy(false); setOpen(false) }, 800)
    } else {
      setBusy(false)
      toast('Allow pop-ups for this site to export the PDF', 'error')
    }
  }

  const nothingToPrint = matched.length === 0 || (!filter.sections.chart && !filter.sections.table)

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} disabled={rows.length === 0}
        title={rows.length === 0 ? 'No orders on the clock yet' : 'Print the timeline as a PDF'}>
        <FileText className="h-3.5 w-3.5 mr-1.5" />
        Report (PDF)
      </Button>

      <Dialog open={open} onClose={() => !busy && setOpen(false)} size="md" title="Timeline report">
        <DialogHeader onClose={() => !busy && setOpen(false)}>Timeline report</DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* O fornecedor só enxerga a si mesmo: a lista teria um nome só. */}
            {!deqiOnly && suppliers.length > 1 && (
              <Field label="Supplier">
                <Select value={filter.supplier} onChange={e => set('supplier', e.target.value)}>
                  <option value="all">All suppliers</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.short_name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Client">
              <Select value={filter.client} onChange={e => set('client', e.target.value)}>
                <option value="">All clients</option>
                {clients.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Stage">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {STAGE_GROUPS
                // O fornecedor nunca vê "Arrived": o dia em que chegou revela o
                // tempo de trânsito que a perna de embarque esconde dele.
                .filter(g => !(deqiOnly && g.id === 'arrived'))
                .map(g => (
                  <Check key={g.id} checked={filter.stages.includes(g.id)} onChange={() => toggleStage(g.id)}
                    label={g.label} />
                ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={deqiOnly ? 'Ready from' : 'Landing from'}>
              <Select value={filter.monthFrom} onChange={e => set('monthFrom', e.target.value)}>
                <option value="">Any month</option>
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </Select>
            </Field>
            <Field label={deqiOnly ? 'Ready until' : 'Landing until'}>
              <Select value={filter.monthTo} onChange={e => set('monthTo', e.target.value)}>
                <option value="">Any month</option>
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </Select>
            </Field>
          </div>

          <Check checked={filter.attentionOnly} onChange={() => set('attentionOnly', !filter.attentionOnly)}
            label="Only orders needing attention"
            hint="Overdue, or a supplier date past the planned day 60" />

          <Field label="Include">
            <div className="flex gap-5">
              <Check checked={filter.sections.chart} label="Chart"
                onChange={() => set('sections', { ...filter.sections, chart: !filter.sections.chart })} />
              <Check checked={filter.sections.table} label="Table"
                onChange={() => set('sections', { ...filter.sections, table: !filter.sections.table })} />
            </div>
          </Field>

          <p className={cn('text-xs font-medium tabular-nums', matched.length === 0 ? 'text-destructive' : 'text-muted-foreground')}>
            {matched.length === 0
              ? 'No orders match these filters'
              : `${matched.length} of ${rows.length} ${rows.length === 1 ? 'order' : 'orders'}`}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={generate} loading={busy} disabled={nothingToPrint}>
            <FileText className="h-4 w-4 mr-1.5" />
            Generate PDF
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
      {children}
    </div>
  )
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}
