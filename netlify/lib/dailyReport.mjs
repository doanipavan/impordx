/**
 * O panorama diário: um kanban de meses, para bater o olho e ver tudo.
 *
 * Aqui mora só a conta e o desenho. Quem busca no banco e manda é
 * `netlify/functions/daily-summary.mts`, para que isto possa ser testado sem
 * rede e sem chave.
 *
 * O mês de cada pedido vem de `arrivalDay`, a mesma função que decide a data
 * que o cliente lê no email dele. Duas contas parecidas em dois arquivos é
 * como o Gantt e o painel do card já perderam dois pedidos de vista.
 */
import { arrivalDay } from './clientEmail.mjs'

const INK = '#1a1d23', MUTED = '#6b727d', FAINT = '#9aa1ab'
const LINE = '#e8ebee', BRAND = '#8b1a1a'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Três famílias de cor, as mesmas do quadro: espera, andando, pronto. */
const COR = {
  'Placed': '#94a3b8',
  'In Production': '#d97706',
  'Ready to Ship': '#d97706',
  'Collected': '#d97706',
  'Shipped': '#16a34a',
  'Arrived': '#16a34a',
}

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export const brl = (v) => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR')

/**
 * Valor em mil, para cabeçalho de coluna estreita.
 *
 * Num espaço de 130px o número cheio rouba a atenção do que a coluna tem de
 * dizer, que é o seu tamanho em relação às vizinhas.
 */
export const mil = (v) => {
  const n = Math.round(Number(v) || 0)
  if (Math.abs(n) < 1000) return brl(n)
  return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'
}

export function mesNome(key) {
  const m = Number(String(key).slice(5, 7))
  return (m >= 1 && m <= 12) ? `${MESES[m - 1]} ${String(key).slice(0, 4)}` : String(key)
}

export function mesCurto(key) {
  const m = Number(String(key).slice(5, 7))
  return (m >= 1 && m <= 12) ? MESES[m - 1].slice(0, 3).toUpperCase() : String(key)
}

export function diaTexto(plain) {
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(plain)
  const semana = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${semana}, ${d} de ${MESES[m - 1].toLowerCase()}`
}

/** Do primeiro ao último mês, sem pular os vazios: o vazio é informação. */
export function monthSpan(keys) {
  const vivos = [...new Set(keys)].filter(Boolean).sort()
  if (vivos.length === 0) return []
  const out = []
  let [y, m] = vivos[0].split('-').map(Number)
  const last = vivos[vivos.length - 1]
  for (let guard = 0; guard < 240; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key >= last) break
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/**
 * Os pedidos que contam, cada um com o mês em que chega.
 *
 * Perdido e arquivado ficam fora. Pedido sem âncora — sem amostra aprovada e
 * sem confirmação — não sabe em que mês cai: sai da lista e é contado à parte,
 * para o total nunca discordar em silêncio do número de cards no quadro.
 */
export function reportRows(cards) {
  const rows = []
  let semRelogio = 0
  for (const c of cards ?? []) {
    if (c.archived || c.status === 'Lost') continue
    const plain = (v) => (v ? String(v).slice(0, 10) : undefined)
    const dia = arrivalDay({
      arrivedOn: plain(c.arrived_at),
      readyOn: plain(c.delivery_date),
      planFrom: plain(c.sample_approved_at) ?? plain(c.order_confirmed_at),
    })
    if (!dia) { semRelogio++; continue }
    rows.push({
      cardId: c.id,
      ref: c.ref_number ?? '',
      cliente: (c.client?.name ?? c.client_name ?? '—').trim(),
      clienteEmail: String(c.client?.email ?? '').trim(),
      vendedor: (c.salesperson_name ?? '').trim() || '— sem vendedor —',
      status: c.status,
      valor: Number(c.value_brl ?? 0),
      chegada: dia,
      mes: dia.slice(0, 7),
    })
  }
  rows.sort((a, b) => b.valor - a.valor || a.cliente.localeCompare(b.cliente, 'pt-BR'))
  return { rows, semRelogio }
}

/** Um grupo por mês, do primeiro ao último, maiores valores em cima. */
export function columns(rows) {
  return monthSpan(rows.map((r) => r.mes)).map((key) => {
    const lista = rows.filter((r) => r.mes === key)
    return { key, lista, total: lista.reduce((s, r) => s + r.valor, 0) }
  })
}

/**
 * O que mudou entre o retrato de ontem e o de hoje.
 *
 * Comparar retratos, e não recalcular pelo histórico de datas, é o que pega
 * também o pedido que trocou de mês **porque chegou**, o que entrou novo e o
 * que saiu — nenhum desses aparece no log de mudança de data.
 *
 * Sem retrato anterior não há aviso nenhum: na primeira manhã tudo seria
 * "novo", e trinta e seis linhas de novidade falsa ensinam a ignorar o bloco.
 */
export function monthMoves(anterior, rows) {
  if (!anterior || anterior.length === 0) return { moves: [], saldo: [] }

  const antes = new Map()
  for (const a of anterior) {
    if (a.card_id) antes.set(a.card_id, a)
  }
  const agora = new Map(rows.map((r) => [r.cardId, r]))
  const moves = []

  for (const r of rows) {
    const a = antes.get(r.cardId)
    if (!a) {
      moves.push({ tipo: 'novo', cliente: r.cliente, valor: r.valor, para: r.mes })
      continue
    }
    if (a.month !== r.mes) {
      moves.push({ tipo: 'moveu', cliente: r.cliente, valor: r.valor, de: a.month, para: r.mes })
    } else if (Math.round(Number(a.value_brl ?? 0)) !== Math.round(r.valor)) {
      moves.push({
        tipo: 'valor', cliente: r.cliente, valor: r.valor,
        de: Number(a.value_brl ?? 0), para: r.valor, mes: r.mes,
      })
    }
  }

  for (const a of antes.values()) {
    if (!agora.has(a.card_id)) {
      moves.push({
        tipo: 'saiu', cliente: a.client_name ?? '—',
        valor: Number(a.value_brl ?? 0), de: a.month,
      })
    }
  }

  // O saldo por mês, para as linhas fecharem com o kanban ao lado.
  const soma = new Map()
  const add = (mes, v) => soma.set(mes, (soma.get(mes) ?? 0) + v)
  for (const m of moves) {
    if (m.tipo === 'moveu') { add(m.de, -m.valor); add(m.para, m.valor) }
    if (m.tipo === 'novo') add(m.para, m.valor)
    if (m.tipo === 'saiu') add(m.de, -m.valor)
    if (m.tipo === 'valor') add(m.mes, m.para - m.de)
  }
  const saldo = [...soma.entries()]
    .filter(([, delta]) => Math.round(delta) !== 0)
    .map(([mes, delta]) => ({ mes, delta }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  return { moves, saldo }
}

function frase(m) {
  const nome = (k) => mesNome(k).split(' ')[0].toLowerCase()
  if (m.tipo === 'moveu') {
    return `<b>${esc(m.cliente)}</b> ${brl(m.valor)} · ${nome(m.de)} &rarr; <b>${nome(m.para)}</b>`
  }
  if (m.tipo === 'novo') return `<b>${esc(m.cliente)}</b> ${brl(m.valor)} · entrou em ${nome(m.para)}`
  if (m.tipo === 'saiu') return `<b>${esc(m.cliente)}</b> ${brl(m.valor)} · saiu de ${nome(m.de)}`
  return `<b>${esc(m.cliente)}</b> · ${brl(m.de)} &rarr; <b>${brl(m.para)}</b> em ${nome(m.mes)}`
}

function coluna(c) {
  const cartoes = c.lista.map((r) => `
    <div style="border-left:3px solid ${COR[r.status] ?? '#94a3b8'};padding:3px 0 3px 6px;margin-bottom:3px">
      <div style="font-size:10.5px;font-weight:700;color:${INK};line-height:1.25">${esc(r.cliente)}</div>
      <div style="font-size:10px;color:${MUTED}">${brl(r.valor)}</div>
    </div>`).join('')

  return `
    <div style="display:inline-block;vertical-align:top;width:132px;max-width:100%;margin:0 2px 8px 0">
      <div style="background:#f7f9fb;border:1px solid ${LINE};border-radius:7px;padding:7px 8px">
        <div style="font-size:11px;font-weight:700;color:${INK};letter-spacing:.02em">${mesCurto(c.key)}</div>
        <div style="font-size:12.5px;font-weight:700;color:${INK};margin-top:2px">${c.lista.length ? mil(c.total) : '—'}</div>
        <div style="font-size:9.5px;color:${FAINT}">${c.lista.length} pedido${c.lista.length === 1 ? '' : 's'}</div>
      </div>
      <div style="padding-top:5px">
        ${cartoes || `<div style="font-size:9.5px;color:${FAINT};padding:6px 0 0 6px">—</div>`}
      </div>
    </div>`
}

/**
 * O email.
 *
 * Quatro colunas de 132px num corpo de 600px: no computador ficam lado a
 * lado, e no celular, quando não cabem, quebram para duas por linha em vez de
 * encolher a letra. São divs inline-block de propósito — float e flexbox não
 * sobrevivem no Outlook, e tabela de quatro colunas o celular encolhe até
 * ninguém ler.
 */
export function dailyReport({ cards, previous, today }) {
  const { rows, semRelogio } = reportRows(cards)
  const cols = columns(rows)
  const { moves, saldo } = monthMoves(previous, rows)

  const total = rows.reduce((s, r) => s + r.valor, 0)
  const semEmail = rows.filter((r) => !r.clienteEmail).length

  const vendedores = [...new Set(rows.map((r) => r.vendedor))]
    .map((v) => ({
      v, total: rows.filter((r) => r.vendedor === v).reduce((s, r) => s + r.valor, 0),
    }))
    .sort((a, b) => b.total - a.total)

  // O assunto conta uma coisa só, e tem que ser verdade na lista de emails.
  // Contar todas as mudanças juntas dizia "3 pedidos mudaram de mês" quando
  // um mudou de mês e dois eram pedidos novos — manchete errada no lugar onde
  // ninguém confere.
  const mudaram = moves.filter((m) => m.tipo === 'moveu').length
  const novos = moves.filter((m) => m.tipo === 'novo').length
  const subject = mudaram > 0
    ? `Panorama do dia — ${mudaram} ${mudaram === 1 ? 'pedido mudou' : 'pedidos mudaram'} de mês`
    : novos > 0
      ? `Panorama do dia — ${novos} ${novos === 1 ? 'pedido novo' : 'pedidos novos'}`
      : `Panorama do dia — ${brl(total)} a caminho`

  const aviso = moves.length === 0 ? '' : `
  <tr><td style="padding:14px 20px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#fffbeb;border:1px solid #fde68a;border-radius:7px">
      <tr><td style="padding:9px 11px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#92400e;padding-bottom:4px">O que mudou</div>
        ${moves.map((m) => `<div style="font-size:11.5px;color:#78350f;padding:1px 0">${frase(m)}</div>`).join('')}
        ${saldo.length === 0 ? '' : `
        <div style="font-size:10.5px;color:#92400e;padding-top:4px">
          ${saldo.map((s) => `${mesNome(s.mes).split(' ')[0]} ${s.delta > 0 ? '+' : '−'}${mil(Math.abs(s.delta))}`).join(' · ')}
        </div>`}
      </td></tr>
    </table>
  </td></tr>`

  const html = `<!doctype html>
<html lang="pt-BR" translate="no"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="google" content="notranslate" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:20px 10px;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0"
       style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3e6ea;border-radius:10px">

  <tr><td style="padding:20px 20px 14px;border-bottom:1px solid ${LINE}">
    <div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${BRAND}">Redantex</div>
    <div style="font-size:18px;font-weight:700;color:${INK};margin-top:3px">Chegadas por mês</div>
    <div style="font-size:12px;color:${MUTED};margin-top:1px">
      ${brl(total)} em ${rows.length} pedido${rows.length === 1 ? '' : 's'} a caminho · ${esc(diaTexto(today))}
    </div>
  </td></tr>
${aviso}
  <tr><td style="padding:14px 18px 6px">
    ${cols.map(coluna).join('')}
  </td></tr>

  <tr><td style="padding:4px 20px 18px">
    <div style="border-top:1px solid ${LINE};padding-top:11px;font-size:10.5px;color:${MUTED};line-height:1.7">
      ${vendedores.map((v) => `${esc(v.v)} <b style="color:${INK}">${mil(v.total)}</b>`).join(' · ')}
      ${semEmail === 0 ? '' : `<br><span style="color:#92400e">${semEmail} de ${rows.length} pedidos têm cliente sem email cadastrado.</span>`}
      ${semRelogio === 0 ? '' : `<br><span style="color:#92400e">${semRelogio} pedido${semRelogio === 1 ? '' : 's'} sem data de amostra nem confirmação — fora deste quadro.</span>`}
      <br><span style="color:${FAINT}">Cinza aguardando · âmbar em produção · verde embarcado. Valores de venda.</span>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`

  const text = [
    `Redantex — Chegadas por mês · ${diaTexto(today)}`,
    `${brl(total)} em ${rows.length} pedidos a caminho`,
    '',
    ...(moves.length ? [
      'MUDOU DE MÊS',
      ...moves.map((m) => '  ' + frase(m).replace(/<[^>]+>/g, '').replace(/&rarr;/g, '→')),
      '',
    ] : []),
    ...cols.flatMap((c) => [
      `${mesNome(c.key)} — ${c.lista.length ? brl(c.total) : '—'} · ${c.lista.length} pedido(s)`,
      ...c.lista.map((r) => `  ${r.cliente} — ${brl(r.valor)}`),
      '',
    ]),
    vendedores.map((v) => `${v.v}: ${brl(v.total)}`).join(' · '),
  ].join('\n')

  return { subject, html, text, rows, moves }
}
