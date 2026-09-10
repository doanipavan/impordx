import { Fragment, useMemo, useState } from 'react'
import { Lock, Loader2, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { cn, formatDate, errorText } from '../lib/utils'
import {
  useFinance, useCloseCard, useReopenCard, useRecordPayment,
  Payment, FinanceCard, Channel, Tranche,
} from '../hooks/useFinance'

const usd = (v: number) =>
  'US$ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl = (v: number) =>
  'R$ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const today = () => new Date().toISOString().slice(0, 10)

interface Group { pi: string; cards: FinanceCard[]; totalUsd: number }

export function FinancePage() {
  const { user } = useAuth()
  const { data, isLoading } = useFinance()
  const isRedantex = user?.role === 'admin' || user?.role === 'member'

  const groups = useMemo<Group[]>(() => {
    if (!data) return []
    const by = new Map<string, FinanceCard[]>()
    for (const c of data.cards) {
      const pi = (c.pi_number ?? '').trim() || '— no proforma yet —'
      by.set(pi, [...(by.get(pi) ?? []), c])
    }
    return [...by.entries()]
      .map(([pi, cards]) => ({ pi, cards, totalUsd: cards.reduce((s, c) => s + c.valueUsd, 0) }))
      .sort((a, b) => b.totalUsd - a.totalUsd)
  }, [data])

  const payByCard = useMemo(() => {
    const m = new Map<string, Partial<Record<Tranche, Payment>>>()
    for (const p of data?.payments ?? []) {
      m.set(p.card_id, { ...(m.get(p.card_id) ?? {}), [p.tranche]: p })
    }
    return m
  }, [data])

  const totals = useMemo(() => {
    let committed = 0, open = 0, paid = 0, orders = 0
    for (const g of groups) {
      committed += g.totalUsd
      orders += g.cards.length
      for (const c of g.cards) {
        const t = payByCard.get(c.id)
        for (const p of [t?.deposit, t?.balance]) {
          if (!p) continue
          if (p.paid_at) paid += Number(p.amount_brl ?? 0)
          else open += Number(p.amount_usd ?? 0)
        }
      }
    }
    return { committed, open, paid, orders }
  }, [groups, payByCard])

  // A regra está no banco. Isto só evita oferecer uma tela que não responderia.
  if (!isRedantex) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Lock className="h-4 w-4" /> This page is for Redantex only.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <h1 className="text-lg font-semibold">Finance</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          What we owe the supplier, order by order
        </p>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border border-border rounded-lg bg-card overflow-x-auto">
            {/* Uma tabela só. Cada proforma com a sua própria fazia cada bloco
                dimensionar as colunas sozinho, e elas não batiam entre si. */}
            <table className="w-full min-w-[880px] table-fixed text-xs tabular-nums">
              <colgroup>
                <col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[18%]" /><col className="w-[12%]" />
                <col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" />
                <col className="w-[9%]" />
              </colgroup>

              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/60 border-b border-border text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-semibold px-3 py-2">Order - DEQI</th>
                  {/* O número que a Valéria tem no sistema dela. É por ele que
                      a conciliação começa, não pelo nosso. */}
                  <th className="text-left font-semibold px-3 py-2">RDX - Purchase Order</th>
                  <th className="text-left font-semibold px-3 py-2">Client</th>
                  <th className="text-left font-semibold px-3 py-2">Stage</th>
                  <th className="text-right font-semibold px-3 py-2">Value</th>
                  <th className="text-right font-semibold px-3 py-2">Deposit 40%</th>
                  <th className="text-right font-semibold px-3 py-2">Balance 60%</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>

              <tbody>
                {groups.map(g => (
                  <Fragment key={g.pi}>
                    <tr className="bg-muted/30 border-y border-border">
                      <td colSpan={4} className="px-3 py-1.5 font-mono text-[11px] font-semibold">
                        {g.pi}
                        <span className="ml-2 font-sans font-normal text-muted-foreground">
                          {g.cards.length} {g.cards.length === 1 ? 'order' : 'orders'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">{usd(g.totalUsd)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{usd(g.totalUsd * 0.4)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{usd(g.totalUsd * 0.6)}</td>
                      <td />
                    </tr>

                    {g.cards.map(c => (
                      <CardRow key={c.id} card={c} tranches={payByCard.get(c.id) ?? {}} />
                    ))}
                  </Fragment>
                ))}

                <tr className="border-t-2 border-border bg-muted/40 font-bold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-muted-foreground font-normal">
                    {totals.orders} orders
                  </td>
                  <td /><td />
                  <td className="px-3 py-2 text-right">{usd(totals.committed)}</td>
                  <td colSpan={2} className="px-3 py-2 text-right">
                    <span className="text-amber-600">{usd(totals.open)} to pay</span>
                    <span className="mx-2 text-muted-foreground font-normal">·</span>
                    <span className="text-green-600">{brl(totals.paid)} paid</span>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CardRow({ card, tranches }: { card: FinanceCard; tranches: Partial<Record<Tranche, Payment>> }) {
  const toast = useToast()
  const close = useCloseCard()
  const reopen = useReopenCard()
  const [editing, setEditing] = useState<Tranche | null>(null)

  const closed = !!(tranches.deposit || tranches.balance)
  // Reabrir apaga as duas parcelas. Com pagamento registrado o banco recusa,
  // então o botão some — melhor não oferecer do que oferecer e negar.
  const anyPaid = !!(tranches.deposit?.paid_at || tranches.balance?.paid_at)

  async function handleReopen() {
    if (!confirm(
      `Reopen ${card.ref_number ?? card.title}?\n\n`
      + `The deposit and balance are removed. Nothing else changes.`
    )) return
    try {
      await reopen.mutateAsync(card.id)
      toast(`${card.ref_number ?? 'Order'} reopened`, 'info')
    } catch (err) {
      toast(errorText(err) ?? 'Could not reopen', 'error')
    }
  }

  async function handleClose() {
    if (!confirm(
      `Close ${card.ref_number ?? card.title} for payment?\n\n`
      + `${usd(card.valueUsd)} — creates the 40% deposit and the 60% balance.`
    )) return
    try {
      await close.mutateAsync(card.id)
      toast(`${card.ref_number ?? 'Order'} closed`, 'success')
    } catch (err) {
      toast(errorText(err) ?? 'Could not close', 'error')
    }
  }

  return (
    <>
      <tr className="border-b border-border/60 hover:bg-muted/20">
        <td className="px-3 py-1.5 font-mono text-[11px] truncate">{card.ref_number ?? '—'}</td>
        <td className="px-3 py-1.5 font-mono text-[11px] truncate">{card.purchase_order || '—'}</td>
        <td className="px-3 py-1.5 truncate">{card.client_name || card.title}</td>
        <td className="px-3 py-1.5 text-muted-foreground truncate">{card.status}</td>
        <td className="px-3 py-1.5 text-right font-semibold">{usd(card.valueUsd)}</td>

        <TrancheCell payment={tranches.deposit} fallback={card.valueUsd * 0.4}
          onEdit={() => setEditing(editing === 'deposit' ? null : 'deposit')} />
        <TrancheCell payment={tranches.balance} fallback={card.valueUsd * 0.6}
          onEdit={() => setEditing(editing === 'balance' ? null : 'balance')} />

        <td className="px-3 py-1.5 text-right">
          {!closed && (
            <button onClick={handleClose} disabled={close.isPending || card.valueUsd <= 0}
              className="text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline">
              Close
            </button>
          )}
          {closed && (anyPaid ? (
            <Check className="h-3 w-3 text-green-600 inline-block" />
          ) : (
            <button onClick={handleReopen} disabled={reopen.isPending}
              className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
              Reopen
            </button>
          ))}
        </td>
      </tr>

      {editing && tranches[editing] && (
        <tr className="bg-muted/20 border-b border-border/60">
          <td colSpan={8} className="px-3 py-2">
            <PaymentForm payment={tranches[editing]!} label={editing === 'deposit' ? 'Deposit' : 'Balance'}
              onDone={() => setEditing(null)} />
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * O previsto até fechar; depois de fechado, o estado e a porta de entrada.
 * Cinza enquanto é só conta, escuro quando virou obrigação.
 */
function TrancheCell({ payment, fallback, onEdit }: {
  payment?: Payment
  fallback: number
  onEdit: () => void
}) {
  if (!payment) {
    return <td className="px-3 py-1.5 text-right text-muted-foreground">{usd(fallback)}</td>
  }
  const paid = !!payment.paid_at
  const overdue = !paid && payment.due_date && payment.due_date < today()

  return (
    <td className="px-3 py-1.5 text-right">
      <button onClick={onEdit} className="hover:underline text-right"
        title={payment.note || undefined}>
        <span className="font-semibold">{usd(Number(payment.amount_usd ?? 0))}</span>
        <span className={cn('block text-[9px] leading-tight',
          paid ? 'text-green-600' : overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
          {paid ? `paid ${formatDate(payment.paid_at!)}`
            : payment.due_date ? `due ${formatDate(payment.due_date)}` : 'no date'}
          {payment.note && <span className="ml-1" title={payment.note}>·</span>}
        </span>
      </button>
    </td>
  )
}

function PaymentForm({ payment, label, onDone }: {
  payment: Payment
  label: string
  onDone: () => void
}) {
  const toast = useToast()
  const record = useRecordPayment()
  const [paidAt, setPaidAt] = useState(payment.paid_at ?? today())
  const [amountBrl, setAmountBrl] = useState(payment.amount_brl?.toString() ?? '')
  const [fxRate, setFxRate] = useState(payment.fx_rate?.toString() ?? '')
  const [channel, setChannel] = useState<Channel | ''>(payment.channel ?? '')
  const [note, setNote] = useState(payment.note ?? '')
  // A previsão é 40%, por decisão. Mas a DEQI cobra entre 40% e 50% conforme
  // o pedido, então o que saiu de verdade tem de caber aqui — um registro que
  // não pode guardar o valor real não é registro.
  const [amountUsd, setAmountUsd] = useState(payment.amount_usd?.toString() ?? '')

  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

  async function save() {
    const value = num(amountBrl), rate = num(fxRate)
    if (!paidAt) return toast('Enter the date it was paid', 'error')
    if (!Number.isFinite(value) || value <= 0) return toast('Enter the amount in reais', 'error')
    if (!Number.isFinite(rate) || rate <= 0) return toast('Enter the exchange rate', 'error')
    try {
      await record.mutateAsync({ id: payment.id, paid_at: paidAt, amount_brl: value, fx_rate: rate,
        channel: (channel || null) as Channel | null, note: note.trim() || null,
        amount_usd: Number.isFinite(num(amountUsd)) && num(amountUsd) > 0 ? num(amountUsd) : null })
      toast('Payment recorded', 'success')
      onDone()
    } catch (err) { toast(errorText(err) ?? 'Could not save', 'error') }
  }

  async function clear() {
    try {
      await record.mutateAsync({ id: payment.id, paid_at: null, amount_brl: null, fx_rate: null, channel: null, note: null })
      toast('Payment cleared', 'info')
      onDone()
    } catch (err) { toast(errorText(err) ?? 'Could not clear', 'error') }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 pb-1.5">{label}</span>
      <Field label="Paid on">
        <Input type="date" className="h-7 text-xs w-36" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
      </Field>
      <Field label="Amount US$">
        <Input className="h-7 text-xs w-24" inputMode="decimal" placeholder="0,00"
          value={amountUsd} onChange={e => setAmountUsd(e.target.value)} />
      </Field>
      <Field label="Amount R$">
        <Input className="h-7 text-xs w-28" inputMode="decimal" placeholder="0,00"
          value={amountBrl} onChange={e => setAmountBrl(e.target.value)} />
      </Field>
      <Field label="Rate">
        <Input className="h-7 text-xs w-20" inputMode="decimal" placeholder="5,40"
          value={fxRate} onChange={e => setFxRate(e.target.value)} />
      </Field>
      <Field label="Route">
        <Select className="h-7 text-xs w-28" value={channel}
          onChange={e => setChannel(e.target.value as Channel | '')}>
          <option value="">—</option>
          <option value="bank">Bank</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      {/* O que os números não contam: qual banco, qual contrato, por que a
          taxa foi essa. É onde a conciliação de daqui a seis meses começa. */}
      <Field label="Note">
        <Input className="h-7 text-xs w-56" placeholder="anything worth remembering"
          value={note} onChange={e => setNote(e.target.value)} />
      </Field>
      <Button size="sm" className="h-7 text-xs" onClick={save} loading={record.isPending}>Save</Button>
      {payment.paid_at && (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={clear}>
          Clear
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>Cancel</Button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
