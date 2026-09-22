import { useMemo } from 'react'
import { useCheckpoints } from '../../hooks/useActivityLog'
import { useAuth } from '../../hooks/useAuth'
import {
  buildRow, timeWindow, calendarDay, daysBetween, saoPauloDay, shortDate, todayInSaoPaulo,
} from '../../lib/orderRows'
import { cn, ORDER_LEG_DAYS, LOGISTICS_TARGET_DAYS, orderSchedule, logisticsOutcome } from '../../lib/utils'
import { Card } from '../../types'

/**
 * A régua deste pedido, por extenso.
 *
 * O painel de cima responde "quantos dias faltam". Este responde "onde isso
 * está no calendário": cada perna vira uma faixa, cada data vira uma marca, e
 * a linha de hoje cruza as três — que é a pergunta que se faz olhando um card
 * sozinho, e que o gráfico da aba Timeline só responde para o quadro inteiro.
 *
 * As datas saem de orderSchedule, como todo o resto. Nada é somado aqui.
 */

const LABEL = 96
const NOTE = 150

type Tone = 'sample' | 'supplier' | 'rdx' | 'done' | 'late'

const BAR: Record<Tone, string> = {
  sample: 'border-violet-300',
  supplier: 'bg-amber-100 border-amber-400 text-amber-800',
  rdx: 'bg-slate-200 border-slate-400 text-slate-700',
  done: 'bg-green-100 border-green-500 text-green-800',
  late: 'bg-red-100 border-red-400 text-red-800',
}

interface Lane {
  id: string
  label: string
  caption: string
  from: Date
  to: Date
  tone: Tone
  /** Texto à direita da faixa: quantos dias e o que ela promete. */
  note: string
}

interface Mark {
  at: Date
  label: string
  tone: 'plan' | 'late' | 'ok' | 'neutral'
  lane: string
}

export function CardGantt({ card }: { card: Card }) {
  const { user } = useAuth()
  const supplierOnly = user?.role === 'viewer'
  const { data: checkpoints = [] } = useCheckpoints([card.id])
  const today = useMemo(() => todayInSaoPaulo(), [])

  const model = useMemo(() => {
    const sched = orderSchedule(card)
    const row = buildRow(card, today)
    if (!sched || !row) return null

    const lanes: Lane[] = []
    const marks: Mark[] = []

    // 1 · Amostra, quando a régua está ancorada numa aprovação de amostra.
    if (row.sampleStart && row.sampleDays != null) {
      lanes.push({
        id: 'sample', label: 'Sample', caption: 'to approval',
        from: row.sampleStart, to: row.confirmed, tone: 'sample',
        note: `${row.sampleDays}d · approved ${shortDate(row.confirmed)}`,
      })
    }

    // 2 · A perna do fornecedor: da âncora até a data que ele deu (ou o dia 60).
    // Pedido antigo lançado hoje tem a data do fornecedor ANTES da âncora: a
    // produção já tinha acontecido. A faixa então cobre o intervalo ao contrário
    // e diz isso, em vez de mostrar "-6d", que não é prazo nenhum.
    const backfilled = row.handover < row.confirmed
    const production = daysBetween(row.confirmed, row.handover)
    lanes.push({
      id: 'supplier', label: 'Supplier', caption: 'production',
      from: backfilled ? row.handover : row.confirmed,
      to: backfilled ? row.confirmed : row.handover,
      tone: backfilled || row.shipping ? 'done' : row.deqiLeft < 0 ? 'late' : 'supplier',
      note: backfilled
        ? `ready ${shortDate(row.handover)}, before the order was entered`
        : row.delivery
          ? `${production}d · supplier says ${shortDate(row.delivery)}`
          : `${production}d · plan, day ${ORDER_LEG_DAYS}`,
    })

    // O dia 60 do plano só vira marca quando o fornecedor prometeu outra coisa:
    // igual à data dele, seria uma marca em cima da outra.
    if (row.delivery && row.delivery.getTime() !== row.plannedReady.getTime()) {
      marks.push({
        at: row.plannedReady, lane: 'supplier',
        label: `Plan · day ${ORDER_LEG_DAYS} (${shortDate(row.plannedReady)})`,
        tone: row.missedPromise ? 'late' : 'plan',
      })
    }

    // 3 · A perna da RDX. O fornecedor não a vê: o dia em que chega no Brasil
    // entrega o tempo de trânsito que a etapa de embarque esconde dele.
    if (!supplierOnly) {
      const outcome = logisticsOutcome(card)
      const end = row.arrivedAt ?? row.arrival
      const transit = daysBetween(row.handover, end)
      lanes.push({
        id: 'rdx', label: 'RDX', caption: 'to Brazil',
        from: row.handover, to: end,
        tone: row.arrived ? (outcome && !outcome.onTarget ? 'late' : 'done')
          : row.totalLeft < 0 ? 'late' : 'rdx',
        note: row.arrivedAt
          ? `${transit}d · arrived ${shortDate(row.arrivedAt)}`
          : row.forecast
            ? `${transit}d · target, lands ${shortDate(row.arrival)}`
            : `${transit}d · plan, lands ${shortDate(row.arrival)}`,
      })

      const shipped = saoPauloDay(card.shipped_at)
      if (shipped) {
        marks.push({ at: shipped, lane: 'rdx', label: `Shipped ${shortDate(shipped)}`, tone: 'neutral' })
      }
      if (row.arrivedAt && outcome) {
        marks.push({
          at: row.arrivedAt, lane: 'rdx',
          label: `Arrived ${shortDate(row.arrivedAt)} · ${outcome.days}d`
            + (outcome.onTarget ? ' · on target' : ` · ${outcome.over} over target`),
          tone: outcome.onTarget ? 'ok' : 'late',
        })
      }
    }

    const win = timeWindow([row], today, supplierOnly)
    return { row, sched, lanes, marks, win }
  }, [card, today, supplierOnly])

  if (!model) return null
  const { row, sched, lanes, marks, win } = model
  const { pct, months } = win

  const dots = checkpoints
    .map(c => ({ at: calendarDay(c.at.slice(0, 10)), status: c.status, by: c.by }))
    .filter((c): c is { at: Date; status: string; by: string } => c.at !== null)
    .filter(c => pct(c.at) >= 0 && pct(c.at) <= 100)

  const todayX = pct(today)
  const inWindow = todayX >= 0 && todayX <= 100

  return (
    <section className="mb-4 pb-4 border-b border-border/70">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Timeline</h3>
        <span className="text-[10px] text-muted-foreground">
          {sched.anchor.kind === 'sample' ? 'from sample approval' : 'from proforma approval'}
          {' · '}{shortDate(row.confirmed)} → {shortDate(row.arrivedAt ?? (supplierOnly ? row.handover : row.arrival))}
          {' · '}{daysBetween(row.confirmed, row.arrivedAt ?? (supplierOnly ? row.handover : row.arrival))} days
        </span>
      </div>

      <div className="relative rounded-md border border-border bg-muted/20 overflow-hidden">
        {/* eixo dos meses */}
        <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: `${LABEL}px 1fr ${NOTE}px` }}>
          <div className="px-2 py-1 border-r border-border" />
          <div className="flex">
            {months.map(m => (
              <div key={m.toISOString()}
                className="flex-1 border-l border-border/60 first:border-l-0 px-1.5 py-1
                           text-[9px] font-bold tracking-wider text-muted-foreground uppercase truncate">
                {m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
              </div>
            ))}
          </div>
          <div className="px-2 py-1 border-l border-border/60">
            <span className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">What it means</span>
          </div>
        </div>

        {lanes.map(lane => {
          const left = pct(lane.from)
          const width = Math.max(pct(lane.to) - left, 0.6)
          return (
            <div key={lane.id} className="grid border-b border-border/50 last:border-b-0"
              style={{ gridTemplateColumns: `${LABEL}px 1fr ${NOTE}px` }}>
              <div className="px-2 py-2 border-r border-border min-w-0">
                <p className="text-[11px] font-semibold leading-none truncate">{lane.label}</p>
                <p className="text-[9px] text-muted-foreground leading-none mt-0.5 truncate">{lane.caption}</p>
              </div>

              <div className="relative py-2.5 min-w-0">
                {/* linhas dos meses */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {months.map((m, i) => (
                    <span key={i} className="flex-1 border-l border-border/40 first:border-l-0" />
                  ))}
                </div>

                <div
                  className={cn('absolute top-1/2 -translate-y-1/2 h-4 rounded-sm border flex items-center px-1.5',
                    BAR[lane.tone])}
                  style={{
                    left: `${left}%`, width: `${width}%`,
                    ...(lane.tone === 'sample' ? {
                      backgroundColor: 'rgb(237 233 246)',
                      backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 2px, rgba(124,58,237,.30) 2px 4px)',
                    } : {}),
                  }}
                  title={`${shortDate(lane.from)} → ${shortDate(lane.to)}`}
                />

                {/* as marcas desta faixa */}
                {marks.filter(m => m.lane === lane.id).map(m => (
                  <span key={m.label}
                    className={cn('absolute top-1/2 h-2.5 w-2.5 rounded-[2px] border-2 z-20 shadow-sm',
                      m.tone === 'late' ? 'border-red-600 bg-red-100'
                        : m.tone === 'ok' ? 'border-green-600 bg-green-100'
                        : m.tone === 'plan' ? 'border-muted-foreground bg-card'
                        : 'border-foreground bg-card')}
                    style={{ left: `${pct(m.at)}%`, transform: 'translate(-50%, -50%) rotate(45deg)' }}
                    title={m.label} />
                ))}

              </div>

              {/* A legenda tem coluna própria: atrás da barra ela saía pela
                  direita do painel e era cortada. */}
              <div className="px-2 py-2 border-l border-border/60 flex items-center min-w-0">
                <span className="text-[9.5px] leading-tight text-muted-foreground">{lane.note}</span>
              </div>
            </div>
          )
        })}

        {/* Cada mudança de coluna, no dia em que aconteceu — o histórico que já
            é gravado, lido como linha do tempo em vez de lista. */}
        {dots.length > 0 && (
          <div className="grid border-t border-border/70 bg-card/40" style={{ gridTemplateColumns: `${LABEL}px 1fr ${NOTE}px` }}>
            <div className="px-2 py-2 border-r border-border">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Moves</p>
            </div>
            <div className="relative py-2.5 min-w-0">
              <div className="absolute inset-0 flex pointer-events-none">
                {months.map((m, i) => (
                  <span key={i} className="flex-1 border-l border-border/40 first:border-l-0" />
                ))}
              </div>
              <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />
              {dots.map(d => (
                <span key={`${d.at.toISOString()}-${d.status}`}
                  className="absolute top-1/2 h-2 w-2 rounded-full bg-foreground border-2 border-card z-10"
                  style={{ left: `${pct(d.at)}%`, transform: 'translate(-50%, -50%)' }}
                  title={`${d.status} · ${shortDate(d.at)} · ${d.by}`} />
              ))}
            </div>
            <div className="px-2 py-2 border-l border-border/60 flex items-center">
              <span className="text-[9.5px] text-muted-foreground">{dots.length} status changes</span>
            </div>
          </div>
        )}

        {/* hoje, cruzando tudo */}
        {inWindow && (
          <>
            <div className="absolute top-0 bottom-0 w-0.5 bg-primary/80 pointer-events-none z-10"
              style={{ left: `calc(${LABEL}px + (100% - ${LABEL + NOTE}px) * ${todayX / 100})` }} />
            <div className="absolute top-0.5 -translate-x-1/2 text-[8px] font-bold tracking-wider uppercase z-10
                            text-primary-foreground bg-primary px-1 rounded-full pointer-events-none"
              style={{ left: `calc(${LABEL}px + (100% - ${LABEL + NOTE}px) * ${todayX / 100})` }}>
              today
            </div>
          </>
        )}
      </div>

      <p className="text-[9.5px] text-muted-foreground mt-1.5">
        {supplierOnly
          ? `Production window: ${ORDER_LEG_DAYS} days from the anchor. The diamond is the planned day ${ORDER_LEG_DAYS}.`
          : `Plan: ${ORDER_LEG_DAYS * 2} days from the anchor. Once the supplier gives a date, the goods land `
            + `${LOGISTICS_TARGET_DAYS} days after it — the diamond is the planned day ${ORDER_LEG_DAYS}, red when the supplier is past it.`}
      </p>
    </section>
  )
}
