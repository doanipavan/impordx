import { useMemo, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useSupplierFilter, useSuppliers } from '../../hooks/useSupplierFilter'
import { useBoardDestinations } from '../../hooks/useItemDestinations'
import { supabase } from '../../lib/supabase'
import { Row, buildRow, sortRows, todayInSaoPaulo } from '../../lib/orderRows'
import {
  ReportFilter, DEFAULT_FILTER, STAGE_GROUPS, StageGroup,
  applyReportFilter, describeFilter, monthLabel, rowMonth, timelineReportHtml,
} from '../../lib/timelineReport'
import {
  ordersSheet, itemsSheet, filtersSheet, headersFor, workbookFileName,
  ORDERS_HEADERS, ITEMS_HEADERS, FILTERS_HEADERS, DATE_HEADERS, ExportItem, SheetRow,
} from '../../lib/timelineWorkbook'
import { cn, salePrice } from '../../lib/utils'
import { salespersonLabel } from '../../types'
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
  const [busyXls, setBusyXls] = useState(false)
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
  const collections = useMemo(
    () => Array.from(new Set(rows.map(r => r.card.collection).filter((c): c is string => !!c))).sort(),
    [rows])
  const salespeople = useMemo(
    () => Array.from(new Set(rows.map(r => salespersonLabel(r.card)).filter((c): c is string => !!c))).sort(),
    [rows])

  // Para onde vão os itens de cada pedido, numa consulta só. Carregado quando
  // a caixa abre — é o que o filtro de destino e a coluna "Goes to" precisam.
  const { data: destinations } = useBoardDestinations(
    open && !deqiOnly ? rows.map(r => r.card.id) : [], open && !deqiOnly)

  const matched = useMemo(
    () => applyReportFilter(rows, filter, deqiOnly, destinations),
    [rows, filter, deqiOnly, destinations])

  // Um só, para o PDF e a planilha nunca nomearem fornecedores diferentes.
  const supplierName = suppliers.find(s => s.id === filter.supplier)?.short_name

  function openDialog() {
    // Abre com o filtro de fornecedor que já está ligado na tela: é o que a
    // pessoa está olhando, então é o que ela espera imprimir.
    setFilter({ ...DEFAULT_FILTER, supplier: pageFilter })
    setOpen(true)
  }

  const set = <K extends keyof ReportFilter>(k: K, v: ReportFilter[K]) => setFilter(f => ({ ...f, [k]: v }))
  const toggleStage = (id: StageGroup) =>
    set('stages', filter.stages.includes(id) ? filter.stages.filter(s => s !== id) : [...filter.stages, id])

  /**
   * A planilha, com os mesmos filtros que o PDF.
   *
   * Os itens só são buscados aqui, no clique: a caixa de filtros não precisa
   * deles para contar os pedidos, e carregar o detalhe de noventa e oito itens
   * toda vez que alguém abre a aba Timeline seria pagar pela exportação que
   * ninguém pediu.
   */
  async function exportExcel() {
    setBusyXls(true)
    try {
      const ids = matched.map(r => r.card.id)
      const { data, error } = await supabase
        .from('card_items')
        .select('card_id, erp_code, reference_code, description, size, quantity,'
          + ' unit_price_usd, destination, sort_order, pricing:card_item_pricing(sale_price_brl)')
        .in('card_id', ids)
      if (error) throw error

      const items: ExportItem[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(i => ({
        card_id: i.card_id as string,
        erp_code: i.erp_code as string | null,
        reference_code: i.reference_code as string | null,
        description: i.description as string | null,
        size: i.size as string | null,
        quantity: i.quantity as number | null,
        unit_price_usd: i.unit_price_usd as number | null,
        // O preço de venda mora atrás da própria política (migração 025): a
        // consulta do fornecedor devolve nada para achatar, e é assim que a
        // margem não sai na planilha dele nem por engano.
        sale_price_brl: salePrice(i.pricing) ?? null,
        destination: i.destination as ExportItem['destination'],
        sort_order: i.sort_order as number | null,
      }))

      const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
      const generatedAt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date()) + ' BRT'

      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      const sheet = (data: SheetRow[], headers: string[], wide: Record<string, number> = {}) => {
        // Sem `cellDates`: as datas já vêm como número de série, calculado só
        // com os campos UTC. Deixar a biblioteca converter um Date usa o fuso
        // da máquina e tira um dia de toda data em São Paulo.
        const ws = XLSX.utils.json_to_sheet(data, { header: headers })
        ws['!cols'] = headers.map(h => ({ wch: wide[h] ?? Math.max(11, h.length + 2) }))
        ws['!freeze'] = { xSplit: 0, ySplit: 1 }
        // Sem o formato, uma data vira o número de série do Excel na tela.
        for (const ref of Object.keys(ws)) {
          if (ref.startsWith('!')) continue
          const col = headers[XLSX.utils.decode_cell(ref).c]
          if (DATE_HEADERS.includes(col)) (ws[ref] as { z?: string }).z = 'dd/mm/yyyy'
        }
        return ws
      }

      const orderHeaders = headersFor(ORDERS_HEADERS, deqiOnly)
      const itemHeaders = headersFor(ITEMS_HEADERS, deqiOnly)
      XLSX.utils.book_append_sheet(wb,
        sheet(ordersSheet(matched, items, deqiOnly), orderHeaders, { Client: 26 }), 'Orders')
      XLSX.utils.book_append_sheet(wb,
        sheet(itemsSheet(matched, items, deqiOnly), itemHeaders, { Description: 34, Client: 26 }), 'Items')
      XLSX.utils.book_append_sheet(wb,
        sheet(filtersSheet(filter, supplierName, { matched: matched.length, total: rows.length },
          generatedAt, deqiOnly), [...FILTERS_HEADERS], { Filter: 22, Value: 34 }), 'Filters')

      XLSX.writeFile(wb, workbookFileName(stamp))
      toast(`${matched.length} order(s) exported`, 'success')
      setOpen(false)
    } catch (err) {
      console.error('Timeline export failed:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Export failed: ${detail}` : 'Export failed', 'error')
    } finally {
      setBusyXls(false)
    }
  }

  async function generate() {
    setBusy(true)
    // Aberta antes do await, senão o navegador não credita o clique e bloqueia.
    const win = window.open('', '_blank')
    const logo = await inlineLogo()
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Para onde a peça vai é assunto da Redantex: o fornecedor não
                tem o campo na tela e não tem o filtro aqui. */}
            {!deqiOnly && (
              <Field label="Goes to">
                <Select value={filter.destination}
                  onChange={e => set('destination', e.target.value as ReportFilter['destination'])}>
                  <option value="all">Client and stock</option>
                  <option value="stock">With stock items</option>
                  <option value="client">Client only</option>
                </Select>
              </Field>
            )}
            {salespeople.length > 1 && (
              <Field label="Salesperson">
                <Select value={filter.salesperson} onChange={e => set('salesperson', e.target.value)}>
                  <option value="">Everyone</option>
                  {salespeople.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
            )}
          </div>

          {collections.length > 1 && (
            <Field label="Collection">
              <Select value={filter.collection} onChange={e => set('collection', e.target.value)}>
                <option value="">All collections</option>
                {collections.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          )}

          <Check checked={filter.attentionOnly} onChange={() => set('attentionOnly', !filter.attentionOnly)}
            label="Only orders needing attention"
            hint="Overdue, or a supplier date past the planned day 60" />

          <Field label="Include · PDF only">
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
          <Button onClick={exportExcel} loading={busyXls} disabled={busy || matched.length === 0}
            className="bg-green-700 hover:bg-green-800 text-white">
            <Download className="h-4 w-4 mr-1.5" />
            Export Excel
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
