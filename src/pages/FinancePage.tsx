import { useMemo, useState } from 'react'
import { Lock, Check, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { cn, formatDate, errorText } from '../lib/utils'
import {
  useFinance, useCloseProforma, useRecordPayment,
  Payment, Proforma, FinanceCard, Channel,
} from '../hooks/useFinance'

const usd = (v: number) =>
  'US$ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl = (v: number) =>
  'R$ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A proforma with the cards it covers and the two tranches it owes. */
interface Group {
  proforma: Proforma
  cards: FinanceCard[]
  totalUsd: number
  deposit?: Payment
  balance?: Payment
}

export function FinancePage() {
  const { user } = useAuth()
  const { data, isLoading } = useFinance()
  const toast = useToast()
  const close = useCloseProforma()
  const [closingId, setClosingId] = useState<string | null>(null)

  const isRedantex = user?.role === 'admin' || user?.role === 'member'

  const groups = useMemo<Group[]>(() => {
    if (!data) return []
    return data.proformas.map(p => {
      const cards = data.cards.filter(
        c => (c.pi_number ?? '').trim().toLowerCase() === p.pi_number.toLowerCase()
      )
      const pays = data.payments.filter(x => x.proforma_id === p.id)
      return {
        proforma: p,
        cards,
        totalUsd: cards.reduce((s, c) => s + c.valueUsd, 0),
        deposit: pays.find(x => x.tranche === 'deposit'),
        balance: pays.find(x => x.tranche === 'balance'),
      }
    }).sort((a, b) => b.totalUsd - a.totalUsd)
  }, [data])

  const totals = useMemo(() => {
    const t = { usd: 0, paidBrl: 0, openUsd: 0, cards: 0 }
    for (const g of groups) {
      t.usd += g.totalUsd
      t.cards += g.cards.length
      for (const p of [g.deposit, g.balance]) {
        if (!p) continue
        if (p.paid_at) t.paidBrl += Number(p.amount_brl ?? 0)
        else t.openUsd += Number(p.amount_usd ?? 0)
      }
    }
    return t
  }, [groups])

  // A regra está no banco; isto só evita mostrar uma tela que não responderia.
  if (!isRedantex) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Lock className="h-4 w-4" /> This page is for Redantex only.
        </p>
      </div>
    )
  }

  async function handleClose(g: Group) {
    if (!confirm(
      `Close ${g.proforma.pi_number}?\n\n`
      + `${g.cards.length} order(s), ${usd(g.totalUsd)}.\n`
      + `This creates the 40% deposit and the 60% balance.`
    )) return
    setClosingId(g.proforma.id)
    try {
      await close.mutateAsync(g.proforma.id)
      toast(`${g.proforma.pi_number} closed`, 'success')
    } catch (err) {
      toast(errorText(err) ?? 'Could not close the proforma', 'error')
    } finally { setClosingId(null) }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <h1 className="text-lg font-semibold">Finance</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          What we owe the supplier, and what has been paid
        </p>
      </div>

      {/* O de cima: comprometido, pago e em aberto. */}
      <div className="mx-4 mt-4 mb-3 border border-border rounded-lg bg-card shrink-0 overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-semibold px-3 pt-2 pb-1">Committed</th>
              <th className="text-right font-semibold px-3 pt-2 pb-1">Orders</th>
              <th className="text-right font-semibold px-3 pt-2 pb-1">Total</th>
              <th className="text-right font-semibold px-3 pt-2 pb-1">Still to pay</th>
              <th className="text-right font-semibold px-3 pt-2 pb-1">Paid</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-1.5 font-medium text-muted-foreground">
                {groups.length} proformas
              </td>
              <td className="px-3 py-1.5 text-right font-semibold">{totals.cards}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{usd(totals.usd)}</td>
              <td className="px-3 py-1.5 text-right font-semibold text-amber-600">{usd(totals.openUsd)}</td>
              <td className="px-3 py-1.5 text-right font-semibold text-green-600">{brl(totals.paidBrl)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 scrollbar-thin">
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {groups.map(g => (
          <ProformaBlock
            key={g.proforma.id}
            group={g}
            closing={closingId === g.proforma.id}
            onClose={() => handleClose(g)}
          />
        ))}
      </div>
    </div>
  )
}

function ProformaBlock({ group, closing, onClose }: {
  group: Group
  closing: boolean
  onClose: () => void
}) {
  const { proforma, cards, totalUsd, deposit, balance } = group
  const open = !proforma.closed_at

  return (
    <section className="mb-4 border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-border bg-muted/40">
        <span className="font-mono text-xs font-semibold">{proforma.pi_number}</span>
        <span className="text-[11px] text-muted-foreground">
          {cards.length} {cards.length === 1 ? 'order' : 'orders'} · {usd(totalUsd)}
        </span>

        {open ? (
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
            onClick={onClose} loading={closing} disabled={totalUsd <= 0}>
            Close proforma
          </Button>
        ) : (
          <span className="ml-auto text-[11px] text-green-700 flex items-center gap-1">
            <Check className="h-3 w-3" /> closed {formatDate(proforma.closed_at!)}
          </span>
        )}
      </div>

      {/* As duas parcelas. Só existem depois de a proforma ser fechada. */}
      {!open && (
        <div className="grid md:grid-cols-2 gap-px bg-border border-b border-border">
          <TrancheBox label="Deposit 40%" payment={deposit} />
          <TrancheBox label="Balance 60%" payment={balance} />
        </div>
      )}

      {/* Uma linha por card, que é como Doani pediu para ler. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-semibold px-3 py-1.5">Order</th>
              <th className="text-left font-semibold px-3 py-1.5">Client</th>
              <th className="text-left font-semibold px-3 py-1.5">Stage</th>
              <th className="text-right font-semibold px-3 py-1.5">Value</th>
              <th className="text-right font-semibold px-3 py-1.5">Deposit</th>
              <th className="text-right font-semibold px-3 py-1.5">Balance</th>
            </tr>
          </thead>
          <tbody>
            {cards.map(c => (
              <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-1.5 font-mono text-[11px]">{c.ref_number ?? '—'}</td>
                <td className="px-3 py-1.5 truncate max-w-[180px]">{c.client_name || c.title}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{c.status}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{usd(c.valueUsd)}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{usd(c.valueUsd * 0.4)}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{usd(c.valueUsd * 0.6)}</td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">
                No orders carry this proforma number
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * Uma parcela: o previsto, e o que a Valéria registrar.
 *
 * O valor em real e a taxa são digitados porque o câmbio é fechado fora do hub,
 * e as duas parcelas saem por caminhos diferentes — sem as duas taxas, o custo
 * real da proforma em reais não existe em lugar nenhum.
 */
function TrancheBox({ label, payment }: { label: string; payment?: Payment }) {
  const toast = useToast()
  const record = useRecordPayment()
  const [editing, setEditing] = useState(false)
  const [paidAt, setPaidAt] = useState(payment?.paid_at ?? '')
  const [amountBrl, setAmountBrl] = useState(payment?.amount_brl?.toString() ?? '')
  const [fxRate, setFxRate] = useState(payment?.fx_rate?.toString() ?? '')
  const [channel, setChannel] = useState<Channel | ''>(payment?.channel ?? '')

  if (!payment) {
    return (
      <div className="bg-card px-3 py-2">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">—</p>
      </div>
    )
  }

  const paid = !!payment.paid_at
  const overdue = !paid && payment.due_date && payment.due_date < new Date().toISOString().slice(0, 10)

  async function save() {
    const brlValue = Number(amountBrl.replace(',', '.'))
    const rate = Number(fxRate.replace(',', '.'))
    if (!paidAt) { toast('Enter the date it was paid', 'error'); return }
    if (!Number.isFinite(brlValue) || brlValue <= 0) { toast('Enter the amount in reais', 'error'); return }
    if (!Number.isFinite(rate) || rate <= 0) { toast('Enter the exchange rate', 'error'); return }
    try {
      await record.mutateAsync({
        id: payment!.id,
        paid_at: paidAt,
        amount_brl: brlValue,
        fx_rate: rate,
        channel: (channel || null) as Channel | null,
      })
      toast('Payment recorded', 'success')
      setEditing(false)
    } catch (err) {
      toast(errorText(err) ?? 'Could not save', 'error')
    }
  }

  return (
    <div className="bg-card px-3 py-2">
      <div className="flex items-baseline gap-2">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums">{usd(Number(payment.amount_usd ?? 0))}</p>
        {payment.due_date && (
          <span className={cn('text-[10px] ml-auto',
            paid ? 'text-green-600' : overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
            {paid ? `paid ${formatDate(payment.paid_at!)}` : `due ${formatDate(payment.due_date)}`}
          </span>
        )}
      </div>

      {paid && !editing && (
        <p className="text-[11px] text-muted-foreground mt-1">
          {brl(Number(payment.amount_brl ?? 0))} at {payment.fx_rate}
          {payment.channel && ` · ${payment.channel === 'bank' ? 'bank' : 'other'}`}
          <button className="ml-2 underline hover:text-foreground" onClick={() => setEditing(true)}>edit</button>
        </p>
      )}

      {!paid && !editing && (
        <button className="text-[11px] text-primary underline mt-1" onClick={() => setEditing(true)}>
          Record payment
        </button>
      )}

      {editing && (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <Input type="date" className="h-7 text-xs" value={paidAt}
              onChange={e => setPaidAt(e.target.value)} title="Paid on" />
            <Input className="h-7 text-xs" inputMode="decimal" placeholder="R$ 0,00"
              value={amountBrl} onChange={e => setAmountBrl(e.target.value)} title="Amount in reais" />
            <Input className="h-7 text-xs" inputMode="decimal" placeholder="rate"
              value={fxRate} onChange={e => setFxRate(e.target.value)} title="Exchange rate" />
          </div>
          <Select className="h-7 text-xs" value={channel}
            onChange={e => setChannel(e.target.value as Channel | '')}>
            <option value="">— how it went out —</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </Select>
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" onClick={save} loading={record.isPending}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
