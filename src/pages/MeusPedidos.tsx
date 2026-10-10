import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Lock, AlertTriangle } from 'lucide-react'
import { useSalesLink, LinkOrder } from '../hooks/useSalesLink'
import { usePortuguesePage } from '../hooks/usePortuguesePage'
import { orderSchedule } from '../lib/utils'
import { monthName, forecastBand, shortDay, brl, pecas } from '../lib/salesPanel'

/**
 * A carteira do vendedor, no celular, sem conta e sem senha.
 *
 * Em português, como as outras páginas que não são do hub — e por isso com
 * `usePortuguesePage`: o `index.html` declara inglês, e o Chrome, vendo
 * português numa página declarada em inglês, já chutou espanhol e traduziu
 * por cima na tela de um cliente. O `netlify/edge-functions/approval-preview`
 * faz a mesma correção antes de o JavaScript rodar.
 *
 * A previsão de chegada sai de `orderSchedule`, a mesma função do quadro e do
 * email ao cliente, e é mostrada como faixa de dez dias — nunca como dia
 * exato. É o que o cliente leu; o vendedor não pode prometer outra coisa.
 */

const ETAPA: Record<string, { texto: string; cor: string; passo: number }> = {
  'Placed': { texto: 'Pedido confirmado', cor: 'bg-slate-100 text-slate-600', passo: 1 },
  'In Production': { texto: 'Em produção', cor: 'bg-amber-100 text-amber-800', passo: 2 },
  'Ready to Ship': { texto: 'Pronto para embarque', cor: 'bg-amber-100 text-amber-800', passo: 3 },
  'Collected': { texto: 'Coletado', cor: 'bg-amber-100 text-amber-800', passo: 4 },
  'Shipped': { texto: 'Embarcado', cor: 'bg-green-100 text-green-800', passo: 5 },
  'Arrived': { texto: 'Chegou', cor: 'bg-green-100 text-green-800', passo: 6 },
}
const PASSOS = 6

export function MeusPedidos() {
  usePortuguesePage()
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, error } = useSalesLink(token)
  const [aberto, setAberto] = useState<string | null>(null)

  const meses = useMemo(() => {
    const linhas = (data?.pedidos ?? []).map((p) => {
      const sched = orderSchedule({
        sample_approved_at: p.sample_approved_at,
        order_confirmed_at: p.order_confirmed_at,
        delivery_date: p.delivery_date,
        arrived_at: p.arrived_at,
        supplier: p.fornecedor ? { short_name: p.fornecedor } : null,
      })
      const chegada = sched?.arrivedAt ?? sched?.arrival ?? null
      return { p, chegada, mes: chegada?.slice(0, 7) ?? null }
    })
    // Pedido sem âncora não sabe em que mês cai. Fica num grupo próprio, no
    // fim, em vez de sumir sem explicação da carteira de quem vendeu.
    const comMes = linhas.filter((l) => l.mes) as { p: LinkOrder; chegada: string; mes: string }[]
    comMes.sort((a, b) => a.chegada.localeCompare(b.chegada))
    const chaves = [...new Set(comMes.map((l) => l.mes))]
    return {
      grupos: chaves.map((k) => ({ mes: k, linhas: comMes.filter((l) => l.mes === k) })),
      semData: linhas.filter((l) => !l.mes).map((l) => l.p),
      total: linhas.reduce((s, l) => s + Number(l.p.value_brl ?? 0), 0),
    }
  }, [data])

  if (isLoading) {
    return (
      <Moldura>
        <div className="py-24 text-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      </Moldura>
    )
  }

  // Token inválido, revogado, ou erro de rede: a mesma tela. Dizer "este link
  // não vale mais" a quem tem um link bom por causa de uma falha de rede é
  // melhor que descrever o motivo a quem está tentando adivinhar um token.
  if (error || !data) {
    return (
      <Moldura>
        <div className="py-24 px-8 text-center">
          <Lock className="h-8 w-8 mx-auto text-slate-300" />
          <p className="text-base font-semibold mt-4">Este link não vale mais</p>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Fale com o escritório da Redantex para receber um novo.
          </p>
        </div>
      </Moldura>
    )
  }

  const clientes = new Set(data.pedidos.map((p) => p.cliente)).size

  return (
    <Moldura>
      <div className="px-4 pt-5 pb-4 border-b border-slate-200">
        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#b4232a]">Redantex</p>
        <h1 className="text-[17px] font-semibold mt-1">Seus pedidos importados</h1>
        <p className="text-[12.5px] text-slate-500">{data.vendedor}</p>
        <p className="text-[21px] font-semibold tabular-nums mt-3">{brl(meses.total)}</p>
        <p className="text-[11px] text-slate-500">
          {data.pedidos.length} pedido{data.pedidos.length === 1 ? '' : 's'} · {clientes} cliente{clientes === 1 ? '' : 's'}
        </p>
      </div>

      {data.pedidos.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-16 px-8">
          Nenhum pedido em andamento no seu nome agora.
        </p>
      )}

      {meses.grupos.map((g) => (
        <div key={g.mes}>
          <div className="flex items-baseline justify-between px-4 pt-3.5 pb-1.5">
            <p className="text-[12px] font-bold uppercase tracking-wide">{monthName(g.mes)}</p>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {brl(g.linhas.reduce((s, l) => s + Number(l.p.value_brl ?? 0), 0))} · {g.linhas.length} pedido{g.linhas.length === 1 ? '' : 's'}
            </p>
          </div>
          {g.linhas.map((l) => (
            <Pedido key={l.p.ref_number} p={l.p} chegada={l.chegada}
              aberto={aberto === l.p.ref_number}
              onToque={() => setAberto(aberto === l.p.ref_number ? null : l.p.ref_number)} />
          ))}
        </div>
      ))}

      {meses.semData.length > 0 && (
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide px-4 pt-3.5 pb-1.5">
            Sem data ainda
          </p>
          {meses.semData.map((p) => (
            <Pedido key={p.ref_number} p={p} chegada={null}
              aberto={aberto === p.ref_number}
              onToque={() => setAberto(aberto === p.ref_number ? null : p.ref_number)} />
          ))}
        </div>
      )}

      <p className="text-[10.5px] text-slate-500 leading-relaxed mx-4 mt-4 pt-3.5 border-t border-slate-200">
        Link pessoal, só seu. Os valores são de venda ao cliente. A faixa de dez dias é a mesma
        que o cliente recebe por email — em importação o prazo depende de embarque e alfândega,
        então não prometa dia fechado.
      </p>
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 py-0 sm:py-8" lang="pt-BR" translate="no">
      <div className="max-w-[440px] mx-auto bg-white min-h-screen sm:min-h-0 sm:rounded-2xl
        sm:border sm:border-slate-200 overflow-hidden pb-6">
        {children}
      </div>
    </div>
  )
}

function Pedido({ p, chegada, aberto, onToque }: {
  p: LinkOrder; chegada: string | null; aberto: boolean; onToque: () => void
}) {
  const etapa = ETAPA[p.status]
  const faixa = forecastBand(chegada)
  const chegou = !!p.arrived_at
  const total = (p.itens ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0)

  const prometida = p.delivery_date_promised?.slice(0, 10)
  const atual = p.delivery_date?.slice(0, 10)
  const andou = !!p.delivery_date_changed_at && !!prometida && !!atual && prometida !== atual
  const dias = andou ? Math.round((Date.parse(atual!) - Date.parse(prometida!)) / 86_400_000) : 0

  return (
    <button onClick={onToque} className={`block w-full text-left mx-0 px-3 py-2.5 border-t
      border-slate-100 ${aberto ? 'bg-slate-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-bold leading-tight">{p.cliente}</p>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap
          shrink-0 ${etapa?.cor ?? 'bg-slate-100 text-slate-600'}`}>
          {etapa?.texto ?? p.status}
        </span>
      </div>

      <p className="text-[12px] mt-1">
        {chegou
          ? `Chegou em ${shortDay(p.arrived_at)}`
          : faixa ? `Chegada ${faixa}` : 'Chegada a confirmar'}
      </p>
      <p className="text-[11.5px] text-slate-500 tabular-nums">
        {brl(Number(p.value_brl ?? 0))} · Pedido de Compra {p.purchase_order ?? '—'}
      </p>

      {aberto && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-1 bg-green-600"
              style={{ width: `${((etapa?.passo ?? 0) / PASSOS) * 100}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Etapa {etapa?.passo ?? 0} de {PASSOS}</p>

          <Rotulo>Datas</Rotulo>
          <table className="w-full">
            <tbody className="text-[12px]">
              <Linha rotulo="Amostra aprovada" valor={shortDay(p.sample_approved_at)} />
              <Linha rotulo="Pedido confirmado" valor={shortDay(p.order_confirmed_at)} />
              <tr className="border-b border-slate-100">
                <td className="py-1 text-slate-500">Pronto na fábrica</td>
                <td className="py-1 text-right tabular-nums">
                  {shortDay(atual)}
                  {andou && (
                    <span className="ml-1.5 text-[9.5px] font-semibold text-amber-800
                      bg-amber-100 rounded-full px-1.5 py-0.5">
                      {dias > 0 ? '+' : ''}{dias} dias
                    </span>
                  )}
                </td>
              </tr>
              <Linha rotulo="Chegada ao Brasil"
                valor={chegou ? shortDay(p.arrived_at) : chegada ? `${shortDay(chegada)} (previsto)` : '—'} />
            </tbody>
          </table>

          {(p.itens ?? []).length > 0 && (
            <>
              <Rotulo>Itens · {pecas(total)} peças</Rotulo>
              <table className="w-full">
                <tbody className="text-[12px]">
                  {p.itens.map((i, n) => (
                    <Linha key={n} rotulo={i.size?.trim() || 'Item'} valor={`${pecas(i.quantity)} pç`} />
                  ))}
                </tbody>
              </table>
            </>
          )}

          {!p.cliente_tem_email && (
            <p className="text-[11.5px] leading-relaxed bg-amber-50 border border-amber-200
              text-amber-900 rounded-lg px-2.5 py-2 mt-3 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Este cliente não tem email cadastrado — não recebeu nenhum aviso. Mande o endereço
              para o escritório cadastrar.
            </p>
          )}
        </div>
      )}
    </button>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
      {children}
    </p>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1 text-slate-500">{rotulo}</td>
      <td className="py-1 text-right tabular-nums">{valor}</td>
    </tr>
  )
}
