import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useCheckpoints, Checkpoint } from '../../hooks/useActivityLog'
import { useSupplierFilter, matchesSupplier } from '../../hooks/useSupplierFilter'
import { useHideArrived, publishArrivedCount, setHideArrived } from '../../hooks/useHideArrived'
import { useArtApproval } from '../../hooks/useArtApproval'
import { useDensity, Density } from '../../hooks/useDensity'
import { cn, ORDER_LEG_DAYS, LOGISTICS_TARGET_DAYS, orderSchedule, clockFor, supplierAccent, supplierNameOf, deliverySlip, logisticsOutcome } from '../../lib/utils'
import { Row, buildRow, sortRows, timeWindow, monthGroups, todayInSaoPaulo, calendarDay, shortRef, shortDate } from '../../lib/orderRows'
import { Card } from '../../types'

// As linhas, a ordem e a janela de tempo moram em src/lib/orderRows.ts, que o
// relatório em PDF também lê. Aqui fica só o desenho.
const LABEL_WIDTH = 150

export function OrdersGantt() {
  const { data: cards = [] } = useCards('orders')
  const { user } = useAuth()
  // Shipping to Brazil is Redantex's leg. The supplier sees its own 60 days
  // and nothing past the handover.
  const deqiOnly = user?.role === 'viewer'
  const [supplierFilter] = useSupplierFilter()
  // Where the order actually was, from the history already being recorded.
  const { data: checkpoints = [] } = useCheckpoints(cards.map(c => c.id))
  // Qual negócio está em foco. Null = o quadro inteiro.
  const [focusId, setFocusId] = useState<string | null>(null)
  const { hidden: hideDone } = useHideArrived()
  const density = useDensity()
  // Quanto a arte ficou com o cliente. Um login de fornecedor recebe um mapa
  // vazio — a política de `approval_requests` é só da Redantex — e a perna
  // azul deixa de existir sem nenhuma condição escrita aqui.
  const { data: art } = useArtApproval(cards.map(c => c.id))
  const navigate = useNavigate()
  const chartRef = useRef<HTMLDivElement>(null)
  const [todayX, setTodayX] = useState<number | null>(null)

  const today = useMemo(() => todayInSaoPaulo(), [])

  const noRecorte = useMemo(
    () => cards.filter(c => matchesSupplier(c, supplierFilter)),
    [cards, supplierFilter],
  )

  const rows = useMemo(() => sortRows(
    noRecorte
      .map(c => buildRow(c, today, art))
      .filter((r): r is Row => r !== null),
    deqiOnly,
  ), [noRecorte, today, deqiOnly, art])

  /**
   * Os pedidos que o relógio ainda não alcança.
   *
   * Antes da amostra aprovada ou da proforma confirmada não há âncora, e sem
   * âncora não há barra — `buildRow` devolve null e eles sumiam da tela sem
   * aparecer em lugar nenhum. É o mesmo buraco que engolia o QUEEN de
   * R$ 95.600 na aba Sales até 25/nov: pedido novo some justamente por ser
   * novidade. Ficam num bloco no fim, sem barra, porque desenhar uma barra
   * para eles seria inventar uma data.
   */
  const semRelogio = useMemo(
    () => noRecorte
      .filter(c => !c.archived && c.status !== 'Lost' && !orderSchedule(c))
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [noRecorte],
  )

  // Terminado é o fim da régua de quem está olhando: para a Redantex, chegou
  // ao Brasil; para o fornecedor, que nunca vê `Arrived`, é o embarque — a
  // perna dele acabou ali e o resto não é dele.
  const done = useMemo(
    () => rows.filter(r => (deqiOnly ? r.shipping : r.arrived)),
    [rows, deqiOnly],
  )
  const doneWord = deqiOnly ? 'shipped' : 'arrived'
  const visible = useMemo(
    () => (hideDone ? rows.filter(r => !(deqiOnly ? r.shipping : r.arrived)) : rows),
    [rows, hideDone, deqiOnly],
  )

  // Focar é filtrar: a janela de tempo abaixo é derivada das linhas visíveis,
  // então reduzir a uma linha faz o gráfico se abrir sobre ela sozinho. Um
  // zoom escrito à parte seria uma segunda régua para as duas discordarem.
  //
  // O foco sai de `rows`, não de `visible`: pedir uma linha pelo nome é mais
  // explícito que o filtro, e um clique que não abre nada parece defeito.
  const focused = focusId ? rows.find(r => r.card.id === focusId) ?? null : null
  const drawn = focused ? [focused] : visible

  // Em blocos, pelo mês em que a coisa acontece: chegada ao Brasil para a
  // Redantex, dia de ficar pronto para o fornecedor. Quarenta e cinco linhas
  // corridas eram uma lista; quatro blocos são uma resposta.
  const grupos = useMemo(() => monthGroups(visible, deqiOnly), [visible, deqiOnly])

  // Quantas linhas o botão lá em cima tem para esconder. Publicado daqui
  // porque a conta depende do recorte do fornecedor e de quem está olhando,
  // e refazê-la no cabeçalho seria a segunda leitura da mesma régua.
  useEffect(() => { publishArrivedCount(done.length) }, [done.length])

  const { start, end, months, pct } = useMemo(() => timeWindow(drawn, today, deqiOnly), [drawn, today, deqiOnly])

  // The today line spans the whole chart, so it is positioned in pixels once
  // the tracks have a measured width rather than per row.
  useEffect(() => {
    function place() {
      const el = chartRef.current
      if (!el) return
      const trackWidth = el.offsetWidth - LABEL_WIDTH
      setTodayX(LABEL_WIDTH + (pct(today) / 100) * trackWidth)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [drawn, start, end, today]) // eslint-disable-line react-hooks/exhaustive-deps

  // A página é só isto. Vazia, tem de dizer por quê — um branco aqui parece
  // um gráfico que não carregou.
  if (rows.length === 0 && semRelogio.length === 0) {
    return (
      <section className="flex-1 border border-border rounded-lg bg-card flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center px-6">
          No orders on the clock yet.
          <span className="block text-xs mt-1">
            An order joins the timeline once its sample is approved or its proforma is confirmed.
          </span>
        </p>
      </section>
    )
  }

  return (
    // Preenche a página que o recebe: antes (até 15/set) morava em cima do
    // board de Orders com um teto de 40% da altura, e nem ele nem o board
    // cabiam. Sem teto, quem rola é o próprio gráfico.
    <section className="flex-1 min-h-0 border border-border rounded-lg bg-card overflow-hidden flex flex-col">
      <div className="flex items-center gap-2.5 px-3 py-1.5 border-b border-border bg-muted/40 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {visible.length} {visible.length === 1 ? 'order' : 'orders'}
        </span>

        {/* O botão do filtro mora no cabeçalho da página, com os outros
            controles. Aqui fica só o efeito dele, escrito ao lado da conta. */}
        {hideDone && done.length > 0 && (
          <span className="text-[11px] font-medium text-amber-800 bg-amber-100
                           border border-amber-300 rounded-full px-2 py-0.5">
            {done.length} {doneWord} hidden
          </span>
        )}

        {/* Sair do foco tem de estar sempre visível: um gráfico que mostra uma
            linha só, sem dizer por quê, parece um gráfico quebrado. */}
        {focused && (
          <button onClick={() => setFocusId(null)}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary
                       bg-primary/10 hover:bg-primary/20 rounded-full pl-2 pr-1.5 py-0.5 transition-colors">
            {focused.card.client_name || focused.card.title}
            <X className="h-3 w-3" />
          </button>
        )}

        <div className="ml-auto hidden md:flex items-center gap-3.5">
          {/* Só aparece quando há azul na tela: para o fornecedor nunca há,
              porque o banco não lhe entrega `approval_requests`. */}
          {rows.some(r => r.artStart) && (
            <Key className="bg-blue-200 border-blue-500" label="Art with the client" />
          )}
          <Key className="border-violet-400"
            style={{
              backgroundColor: 'rgb(237 233 246)',
              backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 2px, rgba(124,58,237,.30) 2px 4px)',
            }}
            label="Sample" />
          <Key className="bg-amber-100 border-amber-500"
            label={deqiOnly ? 'In production' : 'Supplier · production'} />
          {!deqiOnly && <Key className="bg-slate-200 border-slate-400" label={`RDX · to Brazil (${LOGISTICS_TARGET_DAYS}d from the supplier's date)`} />}
          <Key className="bg-green-100 border-green-600" label={deqiOnly ? 'Ready' : 'Done'} />
          <Key className="bg-red-100 border-red-500" label="Overdue" />
        </div>
      </div>

      {/* Esconder tudo é um resultado possível, e um gráfico vazio sem motivo
          escrito parece um gráfico que não carregou. O caminho de volta fica
          na própria frase. */}
      {drawn.length === 0 && semRelogio.length === 0 && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-sm text-muted-foreground text-center">
            Every order on the clock has {doneWord}.
            <button type="button" onClick={() => setHideArrived(false)}
              className="block mx-auto mt-2 text-xs font-semibold text-primary hover:underline">
              Show the {rows.length} {rows.length === 1 ? 'order' : 'orders'} again
            </button>
          </p>
        </div>
      )}

      {/* Quem rola é este miolo, não a página: o eixo dos meses fica preso no
          topo enquanto as linhas passam por baixo. */}
      <div className={cn('flex-1 min-h-0 overflow-auto scrollbar-thin overscroll-contain',
        drawn.length === 0 && semRelogio.length === 0 && 'hidden')}>
          <div ref={chartRef} className="min-w-[620px] relative">

            {/* month axis — fica no topo ao rolar, senão as barras lá embaixo
                perdem a régua. Opaco de propósito: translúcido deixaria as
                linhas passando por baixo aparecerem através dele. */}
            <div className="sticky top-0 z-20 bg-card">
              <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
                <div className="px-2.5 py-1 border-r border-border">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Order</span>
                </div>
                <div className="flex">
                  {months.map(m => (
                    <div key={m.toISOString()}
                      className="flex-1 border-l border-border/60 first:border-l-0 px-2 py-1 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                      {m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Em foco não há blocos: é uma linha só, e um título de mês em
                cima dela seria um rótulo para um item. */}
            {focused ? (
              <>
                <GanttRow row={focused} months={months.length} pct={pct} deqiOnly={deqiOnly}
                  density={density}
                  checkpoints={checkpoints.filter(c => c.card_id === focused.card.id)}
                  focused
                  onFocus={() => setFocusId(null)}
                  onOpenCard={focused.card.ref_number
                    ? () => navigate(`/orders/${focused.card.ref_number}`)
                    : undefined} />
                <FocusDetail row={focused} deqiOnly={deqiOnly} />
              </>
            ) : grupos.map(g => (
              <div key={g.key}>
                <GroupHead label={g.label} count={g.rows.length} />
                {g.rows.map(row => (
                  <GanttRow key={row.card.id} row={row} months={months.length} pct={pct} deqiOnly={deqiOnly}
                    density={density}
                    checkpoints={checkpoints.filter(c => c.card_id === row.card.id)}
                    focused={false}
                    onFocus={() => setFocusId(row.card.id)}
                    onOpenCard={row.card.ref_number
                      ? () => navigate(`/orders/${row.card.ref_number}`)
                      : undefined} />
                ))}
              </div>
            ))}

            {/* O bloco do fim: pedido sem âncora não tem barra, mas existe. */}
            {!focused && semRelogio.length > 0 && (
              <div>
                <GroupHead label="No date yet" count={semRelogio.length} muted />
                {semRelogio.map(c => (
                  <SemRelogio key={c.id} card={c}
                    onOpenCard={c.ref_number ? () => navigate(`/orders/${c.ref_number}`) : undefined} />
                ))}
              </div>
            )}

            {/* today */}
            {todayX !== null && (
              <>
                <div className="absolute top-0 bottom-0 w-0.5 bg-primary/80 pointer-events-none"
                  style={{ left: todayX }} />
                <div className="absolute top-0.5 -translate-x-1/2 text-[9px] font-bold tracking-wider uppercase
                                text-primary-foreground bg-primary px-1.5 rounded-full pointer-events-none"
                  style={{ left: todayX }}>
                  today
                </div>
              </>
            )}
          </div>
      </div>
    </section>
  )
}


/**
 * O negócio em foco, escrito por extenso.
 *
 * A barra diz quando; isto diz o quê. Sem ele, dar zoom mostraria a mesma
 * barra maior — e maior não é mais informação.
 *
 * Só datas e prazos: preço não entra aqui, porque o gráfico é uma das poucas
 * telas que a Ashley e o Carlos também abrem, e a régua de tempo não deve
 * carregar o que a régua de dinheiro protege.
 */
export function FocusDetail({ row, deqiOnly }: { row: Row; deqiOnly: boolean }) {
  const slip = deliverySlip(row.card)
  const clock = clockFor(row.card)
  const sched = orderSchedule(row.card, clock)
  const outcome = logisticsOutcome(row.card)

  const facts: Array<{ k: string; v: string; tone?: 'late' | 'ok' }> = [
    { k: 'Reference', v: row.card.ref_number ?? '—' },
    { k: 'Status', v: row.card.status },
    {
      k: sched?.anchor.kind === 'sample' ? 'Sample approved' : 'Proforma approved',
      v: shortDate(row.confirmed),
    },
    // O dia 60 do plano fica sempre à vista: é a régua contra a qual a data do
    // fornecedor é julgada. Escondê-lo quando ele dá uma data é esconder o atraso.
    { k: `Planned ready (day ${clock.productionDays})`, v: shortDate(row.plannedReady) },
  ]

  if (!deqiOnly) {
    facts.push({
      k: row.forecast
        ? `Lands in Brazil (supplier date + ${LOGISTICS_TARGET_DAYS})`
        : `Lands in Brazil (day ${clock.productionDays + clock.shippingDays}, planned)`,
      v: shortDate(row.arrival),
    })
  }

  // A faixa listrada no gráfico é honesta e minúscula. O número dela mora aqui,
  // que é onde ele pode ser lido.
  if (row.sampleStart && row.sampleDays != null) {
    facts.splice(3, 0, {
      k: 'In sample',
      v: `${row.sampleDays} ${row.sampleDays === 1 ? 'day' : 'days'}`,
    })
  }

  // "Não registrado" e "zero dias" são coisas diferentes, e a diferença é
  // grande: o link de aprovação é de setembro de 2026, e tudo que foi aprovado
  // por WhatsApp antes dele não deixou rastro. Um traço aqui mentiria menos
  // que um zero, e dizer a frase mente ainda menos.
  if (!deqiOnly) {
    facts.push(row.artDays == null
      ? { k: 'Art with the client', v: 'not recorded' }
      : {
          k: 'Art with the client',
          v: `${row.artDays} ${row.artDays === 1 ? 'day' : 'days'}`
            + (row.artRounds > 1 ? ` · ${row.artRounds} rounds` : ''),
          tone: row.artRounds > 1 ? 'late' : undefined,
        })
  }

  if (row.delivery) {
    facts.push({
      k: 'Supplier says',
      v: shortDate(row.delivery),
      tone: row.missedPromise ? 'late' : 'ok',
    })
  }

  // Chegou: o resultado da meta de logística, em dias e em veredito.
  if (!deqiOnly && row.arrivedAt) {
    facts.push({ k: 'Arrived', v: shortDate(row.arrivedAt) })
    if (outcome) {
      facts.push({
        k: `Logistics (target ${LOGISTICS_TARGET_DAYS})`,
        v: outcome.onTarget ? `${outcome.days} days · on target` : `${outcome.days} days · ${outcome.over} over`,
        tone: outcome.onTarget ? 'ok' : 'late',
      })
    }
  }

  // Depois de chegar não há "dias que faltam"; o veredito acima já disse tudo.
  if (!row.arrived) {
    const left = deqiOnly ? row.deqiLeft : row.totalLeft
    facts.push({
      k: 'Days left',
      v: left < 0 ? `${Math.abs(left)} overdue` : String(left),
      tone: left < 0 ? 'late' : undefined,
    })
  }

  return (
    <div className="grid border-b border-border/60 bg-muted/30"
      style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
      <div className="px-2.5 py-2 border-r border-border" />
      <div className="px-3 py-2.5">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {facts.map(f => (
            <div key={f.k} className="min-w-0">
              <dt className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
                {f.k}
              </dt>
              <dd className={cn('text-[11.5px] font-semibold tabular-nums leading-tight',
                f.tone === 'late' ? 'text-red-600' : f.tone === 'ok' ? 'text-green-600' : 'text-foreground')}>
                {f.v}
              </dd>
            </div>
          ))}
        </dl>

        {/* A data que escorregou é o motivo de alguém estar olhando este card. */}
        {slip && (() => {
          // deliverySlip só devolve datas que já parseou, mas um `!` aqui
          // trocaria um campo estranho por uma exceção — e uma exceção neste
          // ponto leva o board inteiro, não só esta linha.
          const promised = calendarDay(slip.promised)
          return (
            <p className="mt-2 text-[10.5px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 inline-block">
              Moved {slip.days > 0 ? `+${slip.days}` : slip.days} days
              {promised ? ` from ${shortDate(promised)}` : ''}
              {slip.reason ? ` — ${slip.reason}` : ''}
            </p>
          )
        })()}
      </div>
    </div>
  )
}

export function GanttRow({ row, months, pct, deqiOnly, checkpoints, focused, density = 'full', onFocus, onOpenCard }: {
  row: Row; months: number; pct: (d: Date) => number; deqiOnly: boolean; checkpoints: Checkpoint[]
  focused: boolean
  density?: Density
  onFocus: () => void
  onOpenCard?: () => void
}) {
  // Limpo tira o que se repete em toda linha e guarda o resto a um clique:
  // noventa palavras e uns quatrocentos pontos pretos que são história, não
  // risco. Em foco tudo volta, porque aí a linha é a tela inteira.
  const cheio = density === 'full' || focused
  // A barra começa na amostra quando houve uma. Tudo em proporção verdadeira:
  // seis dias de amostra ao lado de cento e vinte de pedido são um fio, e é
  // isso mesmo que eles são. O número legível fica no painel de detalhe, em
  // texto — uma largura mínima deixaria dois dias e dezesseis parecerem iguais,
  // num gráfico cujo eixo inteiro é o tempo.
  const anchorX = pct(row.confirmed)
  const left = row.sampleStart ? pct(row.sampleStart) : anchorX
  const right = pct(deqiOnly ? row.handover : row.arrival)
  const mid = pct(row.handover)
  const span = right - left
  const sampleWidth = span > 0 ? ((anchorX - left) / span) * 100 : 0
  const rest = 100 - sampleWidth
  const deqiWidth = deqiOnly ? rest : (span > 0 ? ((mid - anchorX) / span) * 100 : rest)

  const deqiState = row.shipping ? 'done' : row.deqiLeft < 0 ? 'late' : 'deqi'
  // Embarcado não é entregue. A perna da RDX só fecha quando a mercadoria
  // chega — e fecha verde ou vermelha conforme a meta de 50 dias.
  const outcome = logisticsOutcome(row.card)
  const rdxState = row.arrived ? (outcome && !outcome.onTarget ? 'late' : 'done')
    : row.totalLeft < 0 ? 'late' : 'rdx'

  const segment = {
    deqi: 'bg-amber-100 text-amber-700',
    rdx: 'bg-slate-200 text-slate-600',
    done: 'bg-green-100 text-green-700',
    late: 'bg-red-100 text-red-700',
  }

  const daysLeft = deqiOnly ? row.deqiLeft : row.totalLeft
  const finished = deqiOnly ? row.shipping : row.arrived
  const chip = finished ? (outcome && !outcome.onTarget ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
    : daysLeft < 0 ? 'bg-red-100 text-red-700'
    : daysLeft <= 21 ? 'bg-amber-100 text-amber-700'
    : 'bg-muted text-muted-foreground'

  return (
    // Quem é o fornecedor não está escrito em lugar nenhum da linha, por decisão
    // (14 Sep: o hub se refere ao fornecedor genericamente). Está na cor da
    // borda esquerda — a mesma paleta de acento que o hub já usa, fora das cores
    // de status — e no nome ao passar o mouse. O filtro no topo é onde os nomes
    // vivem: escolhido um fornecedor, todas as linhas ficam da mesma cor.
    <div className={cn('grid border-b border-border/60 last:border-b-0 hover:bg-muted/30 transition-colors',
        'border-l-[3px]', supplierAccent(supplierNameOf(row.card)).edge)}
      style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
      {/* Client and number on one line. The prefix is ORD-2026- on every row,
          so it distinguishes nothing and costs the height of a second line;
          the full reference stays in the tooltip. */}
      {/* O nome abre o card; a faixa do tempo dá zoom. Dois alvos separados,
          porque são duas intenções diferentes — e um clique que faz as duas
          coisas sempre faz a errada. */}
      <div className="px-2.5 py-2 border-r border-border min-w-0">
        <button
          type="button"
          onClick={onOpenCard}
          disabled={!onOpenCard}
          title={onOpenCard
            ? `Open ${row.card.ref_number} · ${supplierNameOf(row.card) ?? 'supplier unset'} · counted from ${shortDate(row.confirmed)}`
            : 'This order has no reference number yet'}
          className={cn(
            'group/name w-full text-left text-[11.5px] font-semibold truncate leading-none',
            'flex items-center gap-1.5 rounded-sm',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
            onOpenCard && 'hover:text-primary cursor-pointer'
          )}>
          <span className="truncate">{row.card.client_name || row.card.title}</span>
          {row.card.ref_number && (
            <span className="font-mono font-normal text-[9px] text-muted-foreground/70 tabular-nums">
              {shortRef(row.card.ref_number)}
            </span>
          )}
          {onOpenCard && (
            <ExternalLink className="h-2.5 w-2.5 shrink-0 ml-auto opacity-0 group-hover/name:opacity-70 transition-opacity" />
          )}
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onFocus}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus() } }}
        title={focused ? 'Back to every order' : 'Zoom in on this order'}
        className="relative py-2 cursor-zoom-in focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-primary focus-visible:-outline-offset-2"
        style={focused ? { cursor: 'zoom-out' } : undefined}>
        {/* month gridlines */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: months }).map((_, i) => (
            <span key={i} className="flex-1 border-l border-border/50 first:border-l-0" />
          ))}
        </div>

        <div className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm border border-border flex overflow-hidden"
          style={{ left: `${left}%`, width: `${right - left}%` }}
          title={`${shortDate(row.confirmed)} → ${shortDate(deqiOnly ? row.handover : row.arrival)}`}>
          {/* Listras, não uma quinta cor: a paleta já diz espera / andamento /
              pronto / atrasado, e a amostra não é nenhuma das quatro — é a fase
              anterior a todas elas. Textura separa sem competir. */}
          {row.sampleStart && sampleWidth > 0 && (
            <div
              className="h-full min-w-0 border-r border-card"
              style={{
                width: `${sampleWidth}%`,
                backgroundColor: 'rgb(237 233 246)',
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent 0 2px, rgba(124,58,237,.30) 2px 4px)',
              }}
              title={`${row.sampleDays} days in sample · ${shortDate(row.sampleStart)} → ${shortDate(row.confirmed)}`}
            />
          )}
          <div className={cn('h-full flex items-center justify-center min-w-0', segment[deqiState])}
            style={{ width: `${deqiWidth}%` }}>
            {/* De quem é a perna, não quem é o fornecedor: o nome dele não
                aparece em texto em lugar nenhum do gráfico, por decisão.
                A palavra é a mesma em toda linha, então no modo limpo ela sai:
                o que se repete em quarenta e cinco lugares não distingue
                nenhum deles, e a legenda já diz de quem é a cor. */}
            {cheio && <span className="text-[9px] font-bold tracking-wide px-1 truncate">SUPPLIER</span>}
          </div>
          {!deqiOnly && (
            <>
              <div className="w-px bg-card" />
              <div className={cn('h-full flex items-center justify-center min-w-0', segment[rdxState])}
                style={{ width: `${rest - deqiWidth}%` }}>
                {cheio && <span className="text-[9px] font-bold tracking-wide px-1 truncate">RDX</span>}
              </div>
            </>
          )}
        </div>

        {/* A arte com o cliente, por cima da barra e não dentro dela: ela
            atravessa as fases em vez de ser uma delas — começa antes da
            amostra ser aprovada e, de vez em quando, termina depois. Zero dia
            vira um risco de dois pixels, e é isso que zero dia é. Ausência de
            azul não é zero: é "não registrado", e isso está escrito no painel
            de detalhe, nunca como número. */}
        {row.artStart && row.artEnd && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 rounded-[2px] border border-blue-500 bg-blue-200 z-10"
            style={{
              left: `${pct(row.artStart)}%`,
              width: `${Math.max(pct(row.artEnd) - pct(row.artStart), 0.25)}%`,
            }}
            title={`Art with the client: ${row.artDays} ${row.artDays === 1 ? 'day' : 'days'}`
              + ` · ${shortDate(row.artStart)} → ${shortDate(row.artEnd)}`
              + (row.artRounds > 1 ? ` · ${row.artRounds} rounds` : '')}
          />
        )}

        {/* Each status change, on the day it happened. No planned marker:
            there is no agreed schedule inside the 60 days to compare against,
            and drawing an invented one would be worse than drawing nothing. */}
        {cheio && checkpoints.map(cp => {
          const day = calendarDay(cp.at.slice(0, 10))
          if (!day) return null
          const x = pct(day)
          if (x < 0 || x > 100) return null
          return (
            <div
              key={cp.at}
              className="absolute top-1/2 h-2 w-2 rounded-full bg-foreground border-2 border-card z-10"
              style={{ left: `${x}%`, transform: 'translate(-50%, -50%)' }}
              title={`${cp.status} · ${shortDate(day)} · ${cp.by}`}
            />
          )
        })}

        {/* A data que o fornecedor deu. No modo limpo ela só aparece quando
            já passou do dia 60 do plano: um marcador que existe apenas quando
            algo está errado se explica sozinho, e branco em toda linha ele
            virava enfeite. */}
        {row.delivery && (cheio || row.missedPromise) && (
          <div
            className={cn('absolute top-1/2 h-2.5 w-2.5 rounded-[2px] border-2 z-10 shadow-sm',
              row.missedPromise
                ? 'border-red-600 bg-red-100'
                : 'border-foreground bg-card')}
            style={{ left: `${pct(row.delivery)}%`, transform: 'translate(-50%, -50%) rotate(45deg)' }}
            title={row.missedPromise
              ? `The supplier gave ${shortDate(row.delivery)} — past the planned day ${ORDER_LEG_DAYS} (${shortDate(row.plannedReady)})`
              : `Ready date from the supplier: ${shortDate(row.delivery)}`}
          />
        )}

        <div className={cn('absolute top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap', chip)}
          style={{ left: `calc(${right}% + 10px)` }}>
          {finished
            ? (deqiOnly ? 'ready'
              : outcome ? `arrived · ${outcome.days}d${outcome.onTarget ? '' : ` (${outcome.over} over)`}`
              : 'arrived')
            : row.shipped && !deqiOnly ? `shipped · ${daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`}`
            : daysLeft < 0 ? `${Math.abs(daysLeft)}d over`
            : `${daysLeft}d`}
        </div>
      </div>
    </div>
  )
}

/**
 * O título do bloco de um mês.
 *
 * Gruda logo abaixo do eixo dos meses, que também gruda: rolando, você sempre
 * sabe que mês está lendo sem contar linha nem voltar ao topo. O `top` é a
 * altura do eixo — os dois empilhados, não sobrepostos.
 */
function GroupHead({ label, count, muted }: { label: string; count: number; muted?: boolean }) {
  return (
    <div className={cn('sticky top-[25px] z-10 flex items-baseline gap-2 px-3 py-1.5',
      'border-y border-border bg-muted/80 backdrop-blur-sm')}>
      <span className={cn('text-[11.5px] font-semibold',
        muted ? 'text-muted-foreground' : 'text-foreground')}>
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {count} {count === 1 ? 'order' : 'orders'}
      </span>
    </div>
  )
}

/**
 * Um pedido sem relógio: nome, referência, etapa. Sem barra.
 *
 * Desenhar uma barra aqui exigiria inventar uma data de chegada, e inventar
 * data num gráfico cujo eixo inteiro é o tempo é pior que não desenhar.
 */
function SemRelogio({ card, onOpenCard }: { card: Card; onOpenCard?: () => void }) {
  return (
    <div className={cn('grid border-b border-border/60 hover:bg-muted/30 transition-colors',
        'border-l-[3px]', supplierAccent(supplierNameOf(card)).edge)}
      style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
      <div className="px-2.5 py-2 border-r border-border min-w-0">
        <button type="button" onClick={onOpenCard} disabled={!onOpenCard}
          title={onOpenCard ? `Open ${card.ref_number}` : 'This order has no reference number yet'}
          className={cn('group/name w-full text-left text-[11.5px] font-semibold truncate leading-none',
            'flex items-center gap-1.5 rounded-sm',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
            onOpenCard && 'hover:text-primary cursor-pointer')}>
          <span className="truncate">{card.client_name || card.title}</span>
          {card.ref_number && (
            <span className="font-mono font-normal text-[9px] text-muted-foreground/70 tabular-nums">
              {shortRef(card.ref_number)}
            </span>
          )}
          {onOpenCard && (
            <ExternalLink className="h-2.5 w-2.5 shrink-0 ml-auto opacity-0 group-hover/name:opacity-70 transition-opacity" />
          )}
        </button>
      </div>
      <div className="py-2 px-3 flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {card.status}
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          The clock starts when the sample is approved or the proforma is confirmed.
        </span>
      </div>
    </div>
  )
}

function Key({ className, label, style }: { className: string; label: string; style?: React.CSSProperties }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <i className={cn('block h-1.5 w-4 rounded-sm border', className)} style={style} />
      {label}
    </span>
  )
}
