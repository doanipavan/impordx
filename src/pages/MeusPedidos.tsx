import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Lock, AlertTriangle } from 'lucide-react'
import { useSalesLink, LinkOrder } from '../hooks/useSalesLink'
import { usePortuguesePage } from '../hooks/usePortuguesePage'
import { orderSchedule } from '../lib/utils'
import { monthName, forecastDays, shortDay, brl, pecas } from '../lib/salesPanel'
import { contiguousMonths } from '../lib/orderTotals'

/**
 * A carteira do vendedor, no celular, sem conta e sem senha.
 *
 * Um kanban de meses: uma coluna por mês, e a faixa **rola de lado**. É o
 * único arranjo em que um kanban cabe numa tela de 390px — espremer quatro
 * meses na largura deixaria nenhum deles legível — e é o gesto que todo mundo
 * já conhece de outros quadros. No computador os meses aparecem juntos.
 *
 * Em português, como as outras páginas que não são do hub, e por isso com
 * `usePortuguesePage`: o `index.html` declara inglês, e o Chrome, vendo
 * português numa página declarada em inglês, já chutou espanhol e traduziu
 * por cima na tela de um cliente. O `approval-preview` faz a mesma correção
 * antes de o JavaScript rodar.
 *
 * A previsão sai de `orderSchedule`, a mesma função do quadro e do email ao
 * cliente, e aparece como faixa de dez dias — nunca como dia exato. É o que o
 * cliente leu; o vendedor não pode prometer outra coisa.
 */

const ETAPA: Record<string, { curto: string; cor: string; passo: number }> = {
  'Placed': { curto: 'Confirmado', cor: 'bg-slate-100 text-slate-600', passo: 1 },
  'In Production': { curto: 'Em produção', cor: 'bg-amber-100 text-amber-800', passo: 2 },
  'Ready to Ship': { curto: 'Pronto', cor: 'bg-amber-100 text-amber-800', passo: 3 },
  'Collected': { curto: 'Coletado', cor: 'bg-amber-100 text-amber-800', passo: 4 },
  'Shipped': { curto: 'Embarcado', cor: 'bg-green-100 text-green-800', passo: 5 },
  'Arrived': { curto: 'Chegou', cor: 'bg-green-100 text-green-800', passo: 6 },
}
const PASSOS = 6

interface Linha { p: LinkOrder; chegada: string | null; mes: string | null }

export function MeusPedidos() {
  usePortuguesePage()
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, error } = useSalesLink(token)
  const [aberto, setAberto] = useState<string | null>(null)

  const { colunas, semData, total } = useMemo(() => {
    const linhas: Linha[] = (data?.pedidos ?? []).map((p) => {
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

    const comMes = linhas.filter((l): l is Linha & { mes: string } => !!l.mes)
    // O maior valor em cima dentro de cada mês: numa coluna estreita, o que
    // pesa tem de estar onde o olho cai primeiro.
    comMes.sort((a, b) => Number(b.p.value_brl ?? 0) - Number(a.p.value_brl ?? 0))

    return {
      // Mês vazio no meio aparece: a lacuna é informação, e sem ela dois
      // meses distantes pareceriam vizinhos.
      colunas: contiguousMonths(comMes.map((l) => l.mes)).map((mes) => ({
        mes,
        linhas: comMes.filter((l) => l.mes === mes),
      })),
      // Pedido sem âncora não sabe em que mês cai. Ganha a última coluna em
      // vez de sumir da carteira de quem o vendeu.
      semData: linhas.filter((l) => !l.mes),
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
  const nenhum = data.pedidos.length === 0

  return (
    <Moldura>
      <div className="px-4 pt-5 pb-4 border-b border-slate-200">
        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#b4232a]">Redantex</p>
        <h1 className="text-[17px] font-semibold mt-1">Seus pedidos importados</h1>
        <p className="text-[12.5px] text-slate-500">{data.vendedor}</p>
        <p className="text-[21px] font-semibold tabular-nums mt-3">{brl(total)}</p>
        <p className="text-[11px] text-slate-500">
          {data.pedidos.length} pedido{data.pedidos.length === 1 ? '' : 's'} · {clientes} cliente{clientes === 1 ? '' : 's'}
        </p>
      </div>

      {nenhum ? (
        <p className="text-sm text-slate-500 text-center py-16 px-8">
          Nenhum pedido em andamento no seu nome agora.
        </p>
      ) : (
        <>
          {/* A faixa que rola de lado. `snap` faz a coluna parar inteira
              debaixo do dedo em vez de ficar meio cortada. */}
          <div className="overflow-x-auto snap-x snap-mandatory py-3">
            <div className="flex gap-2.5 px-3 items-start">
              {colunas.map((c) => (
                <Coluna key={c.mes} titulo={monthName(c.mes)} linhas={c.linhas}
                  aberto={aberto} onToque={setAberto} />
              ))}
              {semData.length > 0 && (
                <Coluna titulo="Sem data ainda" linhas={semData}
                  aberto={aberto} onToque={setAberto} />
              )}
            </div>
          </div>

          <p className="text-[10.5px] text-slate-500 leading-relaxed mx-4 mt-1 pt-3.5
            border-t border-slate-200">
            Arraste de lado para ver os outros meses. Link pessoal, só seu. Os valores são de
            venda ao cliente. A faixa de dez dias é a mesma que o cliente recebe por email —
            em importação o prazo depende de embarque e alfândega, então não prometa dia fechado.
          </p>
        </>
      )}
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 sm:py-8" lang="pt-BR" translate="no">
      <div className="max-w-full sm:max-w-5xl mx-auto bg-white min-h-screen sm:min-h-0
        sm:rounded-2xl sm:border sm:border-slate-200 overflow-hidden pb-6">
        {children}
      </div>
    </div>
  )
}

function Coluna({ titulo, linhas, aberto, onToque }: {
  titulo: string
  linhas: Linha[]
  aberto: string | null
  onToque: (ref: string | null) => void
}) {
  const soma = linhas.reduce((s, l) => s + Number(l.p.value_brl ?? 0), 0)
  return (
    <div className="shrink-0 w-[250px] snap-start rounded-xl border border-slate-200
      bg-slate-50 overflow-hidden">
      <div className="px-2.5 py-2 bg-white border-b border-slate-200">
        <p className="text-[11.5px] font-bold">{titulo}</p>
        <p className="text-[15px] font-semibold tabular-nums">{linhas.length ? brl(soma) : '—'}</p>
        <p className="text-[10.5px] text-slate-500">
          {linhas.length} pedido{linhas.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="p-2 flex flex-col gap-1.5 max-h-[60vh] sm:max-h-[520px] overflow-y-auto">
        {linhas.length === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-3.5">Nada chegando</p>
        )}
        {linhas.map((l) => (
          <Pedido key={l.p.ref_number} linha={l}
            aberto={aberto === l.p.ref_number}
            onToque={() => onToque(aberto === l.p.ref_number ? null : l.p.ref_number)} />
        ))}
      </div>
    </div>
  )
}

function Pedido({ linha, aberto, onToque }: {
  linha: Linha; aberto: boolean; onToque: () => void
}) {
  const { p, chegada } = linha
  const etapa = ETAPA[p.status]
  const chegou = !!p.arrived_at
  const dias = forecastDays(chegada)
  const total = (p.itens ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0)

  const prometida = p.delivery_date_promised?.slice(0, 10)
  const atual = p.delivery_date?.slice(0, 10)
  const andou = !!p.delivery_date_changed_at && !!prometida && !!atual && prometida !== atual
  const andou_dias = andou
    ? Math.round((Date.parse(atual!) - Date.parse(prometida!)) / 86_400_000)
    : 0

  return (
    <button onClick={onToque} className={`block w-full text-left rounded-lg border px-2.5 py-2
      bg-white ${aberto ? 'border-slate-400 shadow-sm' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[12.5px] font-bold leading-tight">{p.cliente}</p>
        <span className={`text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap
          shrink-0 ${etapa?.cor ?? 'bg-slate-100 text-slate-600'}`}>
          {etapa?.curto ?? p.status}
        </span>
      </div>

      <p className="text-[13px] tabular-nums mt-1">{brl(Number(p.value_brl ?? 0))}</p>
      <p className="text-[10.5px] text-slate-500">
        {chegou
          ? `chegou em ${shortDay(p.arrived_at)}`
          // O mês está no alto da coluna, então o cartão diz só os dois dias.
          : dias ? `chega entre ${dias}` : 'chegada a confirmar'}
      </p>

      {aberto && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200">
          <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-1 bg-green-600"
              style={{ width: `${((etapa?.passo ?? 0) / PASSOS) * 100}%` }} />
          </div>
          <p className="text-[9.5px] text-slate-500 mt-1">Etapa {etapa?.passo ?? 0} de {PASSOS}</p>

          <Rotulo>Datas</Rotulo>
          <table className="w-full">
            <tbody className="text-[11px]">
              <L rotulo="Amostra aprovada" valor={shortDay(p.sample_approved_at)} />
              <L rotulo="Pedido confirmado" valor={shortDay(p.order_confirmed_at)} />
              <tr className="border-b border-slate-100">
                <td className="py-0.5 text-slate-500">Pronto na fábrica</td>
                <td className="py-0.5 text-right tabular-nums">
                  {shortDay(atual)}
                  {andou && (
                    <span className="ml-1 text-[9px] font-semibold text-amber-800
                      bg-amber-100 rounded-full px-1.5">
                      {andou_dias > 0 ? '+' : ''}{andou_dias}d
                    </span>
                  )}
                </td>
              </tr>
              <L rotulo="Chegada ao Brasil"
                valor={chegou ? shortDay(p.arrived_at) : chegada ? shortDay(chegada) : '—'} />
            </tbody>
          </table>

          {(p.itens ?? []).length > 0 && (
            <>
              <Rotulo>Itens · {pecas(total)} peças</Rotulo>
              <table className="w-full">
                <tbody className="text-[11px]">
                  {p.itens.map((i, n) => (
                    <L key={n} rotulo={i.size?.trim() || 'Item'} valor={`${pecas(i.quantity)} pç`} />
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className="text-[10px] text-slate-400 mt-2">
            Pedido de Compra {p.purchase_order ?? '—'}
          </p>

          {!p.cliente_tem_email && (
            <p className="text-[10.5px] leading-snug bg-amber-50 border border-amber-200
              text-amber-900 rounded-lg px-2 py-1.5 mt-2 flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              Cliente sem email cadastrado — não recebeu aviso nenhum. Mande o endereço para
              o escritório.
            </p>
          )}
        </div>
      )}
    </button>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-2.5 mb-0.5">
      {children}
    </p>
  )
}

function L({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-0.5 text-slate-500">{rotulo}</td>
      <td className="py-0.5 text-right tabular-nums">{valor}</td>
    </tr>
  )
}
