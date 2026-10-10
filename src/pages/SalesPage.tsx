import { useMemo, useState } from 'react'
import { Loader2, X, AlertTriangle, Mail, Rows3, Columns3 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useSalesOrders, useCardNotices, SalesCard } from '../hooks/useSalesPanel'
import {
  salesRows, salesMonths, salespeopleIn, monthName, forecastBand,
  shortDay, longDay, brl, pecas, SalesMonth,
} from '../lib/salesPanel'
import { orderSchedule } from '../lib/utils'
import { cn } from '../lib/utils'

/**
 * O painel dos vendedores: cada pedido no mês em que chega ao Brasil.
 *
 * Esta é a única tela do hub escrita em português, e de propósito — é para os
 * vinte e cinco vendedores da Redantex, e o fornecedor não tem linha nenhuma
 * aqui. O resto da interface segue em inglês, inclusive o menu.
 *
 * O mês vem de `orderSchedule`, a mesma função que a timeline lê. A faixa de
 * dez dias é a mesma que sai no email do cliente.
 */

const ETAPA: Record<string, { texto: string; classe: string; passo: number }> = {
  'Placed': { texto: 'Pedido confirmado', classe: 'bg-muted text-muted-foreground', passo: 1 },
  'In Production': { texto: 'Em produção', classe: 'bg-amber-100 text-amber-800', passo: 2 },
  'Ready to Ship': { texto: 'Pronto para embarque', classe: 'bg-amber-100 text-amber-800', passo: 3 },
  'Collected': { texto: 'Coletado', classe: 'bg-amber-100 text-amber-800', passo: 4 },
  'Shipped': { texto: 'Embarcado', classe: 'bg-green-100 text-green-800', passo: 5 },
  'Arrived': { texto: 'Chegou', classe: 'bg-green-100 text-green-800', passo: 6 },
}
const PASSOS = 6

function Etapa({ status }: { status: string }) {
  const e = ETAPA[status]
  return (
    <span className={cn('inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
      e?.classe ?? 'bg-muted text-muted-foreground')}>
      {e?.texto ?? status}
    </span>
  )
}

/**
 * Linhas ou colunas, e a escolha fica.
 *
 * Os dois desenhos servem a perguntas diferentes: em linhas se lê um mês
 * inteiro de cima a baixo, em colunas se comparam os meses de lado. Hoje
 * dezembro tem 28 pedidos e os vizinhos têm 2, 1 e 5 — a coluna mostra a
 * parede, a linha mostra o que tem dentro dela.
 *
 * Guardado no navegador porque é preferência de quem olha, não dado do
 * negócio: ninguém mais precisa saber como você gosta de ver. Se o
 * `localStorage` estiver bloqueado, a tela abre em linhas e funciona igual.
 */
type Vista = 'linhas' | 'colunas'
const VISTA_KEY = 'rdx.sales.vista'

function vistaGuardada(): Vista {
  try {
    return localStorage.getItem(VISTA_KEY) === 'colunas' ? 'colunas' : 'linhas'
  } catch {
    return 'linhas'
  }
}

export function SalesPage() {
  const { user } = useAuth()
  const { data: cards, isLoading } = useSalesOrders()
  const [quem, setQuem] = useState<string | null>(null)
  const [aberto, setAberto] = useState<SalesCard | null>(null)
  const [vista, setVista] = useState<Vista>(vistaGuardada)

  function escolher(v: Vista) {
    setVista(v)
    try { localStorage.setItem(VISTA_KEY, v) } catch { /* aba privada, e tudo bem */ }
  }

  const todas = useMemo(() => salesRows((cards ?? []) as SalesCard[]), [cards])
  const vendedores = useMemo(() => salespeopleIn(todas), [todas])
  const rows = useMemo(
    () => (quem ? todas.filter((r) => r.salesperson === quem) : todas),
    [todas, quem])
  const meses = useMemo(() => salesMonths(rows), [rows])

  const total = rows.reduce((s, r) => s + r.value, 0)
  const clientes = new Set(rows.map((r) => r.client)).size

  // O fornecedor não tem o que fazer nesta tela: é a carteira comercial da
  // Redantex, com valor de venda em cada linha.
  if (user?.role === 'viewer') {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Nothing here for you.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto" lang="pt-BR" translate="no">
      <div className={cn('mx-auto px-6 py-7',
        vista === 'colunas' ? 'max-w-[1600px]' : 'max-w-6xl')}>

        <div className="flex items-end justify-between gap-5 border-b border-border pb-4">
          <div>
            <h1 className="text-lg font-semibold">Vendas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada pedido aberto no mês em que chega ao Brasil
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[22px] font-semibold leading-none tabular-nums">{brl(total)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {rows.length} pedido{rows.length === 1 ? '' : 's'} · {clientes} cliente{clientes === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 mt-4 mb-5">
          <div className="flex flex-wrap gap-1.5">
            <Filtro on={!quem} onClick={() => setQuem(null)}>Todos os vendedores</Filtro>
            {vendedores.map((v) => (
              <Filtro key={v} on={quem === v} onClick={() => setQuem(v)}>{v}</Filtro>
            ))}
          </div>

          {/* Linhas ou colunas. Dois botões, não um que alterna: quem olha vê
              em qual dos dois está sem ter que clicar para descobrir. */}
          <div className="flex shrink-0 rounded-lg border border-border overflow-hidden">
            <Vistao on={vista === 'linhas'} onClick={() => escolher('linhas')}
              titulo="Um mês embaixo do outro">
              <Rows3 className="h-3.5 w-3.5" /> Linhas
            </Vistao>
            <Vistao on={vista === 'colunas'} onClick={() => escolher('colunas')}
              titulo="Um mês ao lado do outro">
              <Columns3 className="h-3.5 w-3.5" /> Colunas
            </Vistao>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-10 text-center">
            Nenhum pedido aberto para mostrar.
          </p>
        )}

        {vista === 'linhas'
          ? <EmLinhas meses={meses} onOpen={setAberto} />
          : <EmColunas meses={meses} onOpen={setAberto} />}

        <p className="text-[11px] text-muted-foreground leading-relaxed mt-4">
          O mês é o da chegada ao Brasil, pela mesma regra que o cliente lê no email: a data que a
          fábrica deu mais a meta de logística, ou o plano de 120 dias enquanto a fábrica não deu
          data. Pedido perdido e arquivado ficam de fora.
        </p>
      </div>

      {aberto && <Gaveta card={aberto} onClose={() => setAberto(null)} />}
    </div>
  )
}

/** Um mês embaixo do outro: o mês inteiro se lê de uma vez. */
function EmLinhas({ meses, onOpen }: {
  meses: SalesMonth[]; onOpen: (c: SalesCard) => void
}) {
  return (
    <>
      {meses.map((mes) => (
        <div key={mes.key} className="rounded-xl border border-border bg-card mb-3 overflow-hidden">
          <CabecalhoMes mes={mes} />
          {mes.rows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-4">Nada chegando</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-4 py-1.5">Cliente</th>
                  <th className="text-left font-medium px-4 py-1.5">Valor de venda</th>
                  <th className="text-left font-medium px-4 py-1.5">Pedido de Compra</th>
                  <th className="text-left font-medium px-4 py-1.5">Etapa</th>
                  <th className="text-left font-medium px-4 py-1.5">Vendedor</th>
                </tr>
              </thead>
              <tbody>
                {mes.rows.map((r) => (
                  <tr key={r.card.id} onClick={() => onOpen(r.card as SalesCard)}
                    className="border-t border-border/60 hover:bg-muted/40 cursor-pointer">
                    <td className="px-4 py-2 text-[12.5px] font-bold">{r.client}</td>
                    <td className="px-4 py-2 text-[12.5px] tabular-nums">{brl(r.value)}</td>
                    <td className="px-4 py-2 text-[12.5px] tabular-nums">{r.card.purchase_order ?? '—'}</td>
                    <td className="px-4 py-2"><Etapa status={r.card.status} /></td>
                    <td className="px-4 py-2 text-[11.5px] text-muted-foreground">{r.salesperson}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  )
}

/**
 * Um mês ao lado do outro, cada um lido de cima a baixo.
 *
 * As colunas têm largura mínima e a faixa rola de lado: com quatro meses cabe
 * na tela, e com doze continua legível em vez de virar doze tiras finas.
 */
function EmColunas({ meses, onOpen }: {
  meses: SalesMonth[]; onOpen: (c: SalesCard) => void
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 items-start" style={{ minWidth: meses.length * 260 }}>
        {meses.map((mes) => (
          <div key={mes.key}
            className="flex-1 min-w-[250px] rounded-xl border border-border bg-card overflow-hidden">
            <CabecalhoMes mes={mes} empilhado />
            <div className="p-2 flex flex-col gap-1.5">
              {mes.rows.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-4">Nada chegando</p>
              )}
              {mes.rows.map((r) => (
                <button key={r.card.id} onClick={() => onOpen(r.card as SalesCard)}
                  className="text-left rounded-lg border border-border bg-card px-2.5 py-2
                    hover:border-muted-foreground/40 transition-colors">
                  <p className="text-[12.5px] font-bold leading-tight">{r.client}</p>
                  <p className="text-[13px] tabular-nums mt-1">{brl(r.value)}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    Pedido de Compra {r.card.purchase_order ?? '—'}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <Etapa status={r.card.status} />
                    <span className="text-[10px] text-muted-foreground truncate">{r.salesperson}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CabecalhoMes({ mes, empilhado }: { mes: SalesMonth; empilhado?: boolean }) {
  const total = mes.rows.length ? brl(mes.total) : '—'
  const quantos = `${mes.rows.length} pedido${mes.rows.length === 1 ? '' : 's'}`
  return (
    <div className={cn('px-4 py-2.5 border-b border-border bg-muted/30',
      empilhado ? '' : 'flex items-baseline justify-between')}>
      <p className="text-[13px] font-semibold">{monthName(mes.key)}</p>
      {empilhado ? (
        <>
          <p className="text-[15px] font-semibold tabular-nums mt-1">{total}</p>
          <p className="text-[11px] text-muted-foreground">{quantos}</p>
        </>
      ) : (
        <p className="text-sm font-semibold tabular-nums">
          {total}
          <span className="text-[11px] text-muted-foreground font-normal ml-1">· {quantos}</span>
        </p>
      )}
    </div>
  )
}

function Vistao({ on, onClick, titulo, children }: {
  on: boolean; onClick: () => void; titulo: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={titulo} aria-pressed={on}
      className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1.5 transition-colors',
        on ? 'bg-foreground text-background font-semibold' : 'bg-card text-muted-foreground hover:bg-muted')}>
      {children}
    </button>
  )
}

function Filtro({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} className={cn(
      'text-xs px-3 py-1 rounded-full border transition-colors',
      on ? 'bg-foreground text-background border-foreground font-semibold'
        : 'bg-card border-border text-foreground hover:bg-muted')}>
      {children}
    </button>
  )
}

const RESUMO_KIND: Record<string, string> = {
  'stage:Placed': 'Pedido confirmado com a fábrica',
  'stage:In Production': 'Produção começou',
  'stage:Ready to Ship': 'Mercadoria pronta na fábrica',
  'stage:Collected': 'Carga coletada pelo transportador',
  'stage:Shipped': 'Embarcado para o Brasil',
  'stage:Arrived': 'Chegou ao Brasil',
  'sample-approved': 'Amostra aprovada',
  'date-confirmed': 'A fábrica cravou a data de produção',
  'date-change': 'A data de produção mudou',
  'reminder': 'Lembrete de acompanhamento',
}

function Gaveta({ card, onClose }: { card: SalesCard; onClose: () => void }) {
  const { data: avisos, isLoading } = useCardNotices(card.id)
  const schedule = orderSchedule(card)
  const chegada = schedule?.arrivedAt ?? schedule?.arrival
  const faixa = forecastBand(chegada)
  const itens = [...(card.card_items ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const total = itens.reduce((s, i) => s + (i.quantity ?? 0), 0)

  const prometida = card.delivery_date_promised?.slice(0, 10)
  const atual = card.delivery_date?.slice(0, 10)
  const andou = !!card.delivery_date_changed_at && !!prometida && !!atual && prometida !== atual
  const dias = andou
    ? Math.round((Date.parse(atual!) - Date.parse(prometida!)) / 86_400_000)
    : 0

  const semEmail = !card.client?.email || !String(card.client.email).trim()
  const passo = ETAPA[card.status]?.passo ?? 0

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[440px] bg-card border-l border-border
        z-50 overflow-y-auto" lang="pt-BR" translate="no">

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border sticky top-0 bg-card">
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight">{card.client?.name ?? card.client_name}</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              {card.title} · {card.collection ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Etapa status={card.status} />
              <span className="text-[10px] text-muted-foreground">
                desde {shortDay(card.status_since?.slice(0, 10))}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[15px] tabular-nums">{brl(Number(card.value_brl ?? 0))}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                Pedido de Compra {card.purchase_order ?? '—'}
              </p>
            </div>
          </div>

          <div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-1 bg-green-600" style={{ width: `${(passo / PASSOS) * 100}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Etapa {passo} de {PASSOS}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
              {schedule?.arrivedAt ? 'Chegada ao Brasil' : 'Chegada prevista'}
            </p>
            <p className="text-[17px] mt-1">{longDay(chegada) ?? 'a confirmar'}</p>
            {!schedule?.arrivedAt && faixa && (
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                O cliente ouviu: {faixa}
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Datas</p>
            <table className="w-full mt-1.5">
              <tbody className="text-[12.5px]">
                <Linha rotulo="Amostra aprovada" valor={shortDay(card.sample_approved_at?.slice(0, 10))} />
                <Linha rotulo="Pedido confirmado" valor={shortDay(card.order_confirmed_at?.slice(0, 10))} />
                <tr className="border-b border-border/50">
                  <td className="py-1.5 text-muted-foreground">Pronto na fábrica</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {shortDay(atual)}
                    {andou && (
                      <span className="ml-1.5 text-[10px] font-semibold text-amber-800 bg-amber-100 rounded-full px-1.5 py-0.5">
                        {dias > 0 ? '+' : ''}{dias} dias · era {shortDay(prometida)}
                      </span>
                    )}
                  </td>
                </tr>
                <Linha rotulo="Chegada ao Brasil"
                  valor={schedule?.arrivedAt ? shortDay(schedule.arrivedAt) : `${shortDay(chegada)} (previsto)`} />
              </tbody>
            </table>
            {andou && card.delivery_date_change_reason && (
              <p className="text-[11px] leading-relaxed text-muted-foreground bg-muted/30 border-l-2 border-border px-2.5 py-2 mt-2">
                <span className="font-semibold text-foreground">A fábrica explicou: </span>
                {card.delivery_date_change_reason}
              </p>
            )}
          </div>

          {itens.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                Itens · {itens.length} medida{itens.length === 1 ? '' : 's'} · {pecas(total)} peças
              </p>
              <table className="w-full mt-1.5">
                <tbody className="text-[12.5px]">
                  {itens.map((i, n) => (
                    <Linha key={n} rotulo={i.size?.trim() || 'Item'} valor={`${pecas(i.quantity)} pç`} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
              Avisos enviados ao cliente
            </p>

            {isLoading && <p className="text-[11.5px] text-muted-foreground mt-2">Carregando…</p>}

            {!isLoading && (avisos?.length ?? 0) > 0 && (
              <ul className="mt-1.5 space-y-0">
                {avisos!.map((a) => (
                  <li key={a.id} className="flex gap-2.5 py-1.5 border-b border-border/50 text-[12px]">
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap min-w-[72px]">
                      {shortDay(a.sent_at?.slice(0, 10))}
                    </span>
                    <span>
                      <span className="font-semibold">{RESUMO_KIND[a.kind] ?? a.kind}</span>
                      {a.summary && (
                        <span className="block text-[11px] text-muted-foreground">{a.summary}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!isLoading && (avisos?.length ?? 0) === 0 && (
              <p className={cn('text-[11.5px] mt-2 rounded-lg px-3 py-2.5 flex items-start gap-2',
                semEmail
                  ? 'bg-amber-50 border border-amber-200 text-amber-900'
                  : 'bg-muted/30 border border-border text-muted-foreground')}>
                {semEmail
                  ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                {semEmail
                  ? 'Este cliente não tem email cadastrado: não recebeu nenhum aviso, e não vai receber até alguém cadastrar o endereço no card.'
                  : 'Nenhum aviso enviado ainda.'}
              </p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            Vendedor {card.salesperson_name?.trim() || '—'} · Proforma {card.pi_number ?? '—'}
          </p>
        </div>
      </aside>
    </>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-1.5 text-muted-foreground">{rotulo}</td>
      <td className="py-1.5 text-right tabular-nums">{valor}</td>
    </tr>
  )
}
