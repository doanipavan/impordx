/**
 * Os emails que o cliente recebe.
 *
 * Um por mudança de etapa — Placed, In Production, Ready to Ship, Collected,
 * Shipped, Arrived — e um lembrete quando o pedido fica quinze dias sem
 * notícia. As três etapas do começo (PI Requested, PI In Preparation, PI
 * Approved) não aparecem aqui de propósito: são a Redantex acertando a
 * proforma com a fábrica, o cliente não tem o que fazer com elas, e cada uma
 * mostraria que a fábrica ainda não confirmou.
 *
 * Três regras de conteúdo, dadas pelo Doani e travadas por teste:
 *
 *   1. **Nenhum valor.** Os itens carregam o preço de compra em dólar — o
 *      custo da Redantex com a DEQI. Esta função não recebe preço nenhum como
 *      argumento, justamente para que não haja um a vazar.
 *   2. **Medida e quantidade, só.** A descrição do item é recado para a
 *      fábrica ("add clip for ring"), não nome de produto. Uma versão
 *      anterior tentava traduzi-la e errava a peça.
 *   3. **Português, e dito ao navegador.** `lang="pt-BR"` com `translate=no`:
 *      é a armadilha que já pegou a página de aprovação, quando o Chrome leu
 *      português dentro de documento inglês, chutou espanhol e escreveu
 *      "óleo" onde era "aceite".
 *
 * A timeline é uma tabela com bolinhas e uma barra — nada de SVG, nada de
 * imagem, nada de flexbox, que é o que sobrevive no Gmail e no Outlook.
 */

/**
 * A meta de logística da Redantex: quantos dias a mercadoria leva do dia em
 * que o fornecedor a dá por pronta até pousar no Brasil.
 *
 * O número de verdade mora em `LOGISTICS_TARGET_DAYS`, em src/lib/utils.ts,
 * que é o que o Gantt e o painel de chegadas leem. Aqui ele é repetido porque
 * uma função do Netlify não importa TypeScript do app — e `check-client-email`
 * compara os dois a cada execução, para a cópia não envelhecer sozinha. Já
 * aconteceu de duas telas guardarem cada uma o seu "+120" e dois pedidos
 * sumirem do gráfico.
 */
export const DEFAULT_LOGISTICS_DAYS = 50

/**
 * O plano inteiro, da aprovação da amostra até pousar no Brasil: duas pernas
 * de `ORDER_LEG_DAYS`, 60 para a fábrica e 60 para a viagem. Vale enquanto o
 * fornecedor não deu data — e é a promessa que a Redantex já faz ao cliente,
 * então pode ser dita a ele. Mesma cópia vigiada por teste que os 50.
 */
export const DEFAULT_PLAN_DAYS = 120

const BRAND = '#8b1a1a'
const INK = '#1a1d23'
const MUTED = '#6b727d'
const FAINT = '#9aa1ab'
const LINE = '#eceef1'
const DONE = '#15803d'
const WAIT = '#cdd2d9'

/** Dia em português, a partir de um `YYYY-MM-DD` puro. Sem fuso, sem instante. */
export function longDay(plain) {
  if (!plain) return null
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return `${d} de ${MESES[m - 1]} de ${y}`
}

/** A forma curta que cabe embaixo de uma bolinha. */
export function shortDay(plain) {
  if (!plain) return null
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${d} ${meses[m - 1]}`
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/**
 * O decêndio em que a data cai: 1 a 10, 11 a 20, 21 ao fim do mês.
 *
 * Dez dias é a granularidade honesta de uma importação — é mais ou menos a
 * folga que um embarque e uma liberação alfandegária comem sem avisar.
 */
export function decendio(plain) {
  if (!plain) return null
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const n = d <= 10 ? 1 : d <= 20 ? 2 : 3
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const de = n === 1 ? 1 : n === 2 ? 11 : 21
  const ate = n === 1 ? 10 : n === 2 ? 20 : ultimo
  return { n, de, ate, mes: MESES[m - 1], ano: y,
    texto: `${n}º decêndio de ${MESES[m - 1]} de ${y}`,
    faixa: `${de} a ${ate} de ${MESES[m - 1]}` }
}

/** Mês e ano, do tamanho de uma coluna da régua. */
export function monthShort(plain) {
  if (!plain) return null
  const [y, m] = String(plain).slice(0, 10).split('-').map(Number)
  if (!y || !m) return null
  const curto = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${curto[m - 1]} ${y}`
}

/** Soma dias a um dia do calendário, sem passar por instante nenhum. */
export function addDays(plain, days) {
  const [y, m, d] = String(plain).slice(0, 10).split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * A medida, como o cliente a lê.
 *
 * O email lista só medida e quantidade. Quando existir um campo de nome
 * comercial por item, ele entra aqui; até lá, a medida basta para o cliente
 * reconhecer o que pediu, e não corre o risco de nomear a peça errada.
 */
export function itemSize({ size }) {
  return String(size ?? '').trim() || 'Item'
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const nf = (n) => Number(n ?? 0).toLocaleString('pt-BR')

/**
 * Uma coluna da timeline. `state` é 'done' | 'now' | 'wait'.
 *
 * O rótulo chega como lista de linhas, não como texto com `<br>` dentro: tudo
 * que vem de fora passa por `esc`, e um rótulo que carregasse marcação sairia
 * escapado na cara do cliente — foi o que aconteceu na primeira versão.
 */
function step({ lines, day, state }, width) {
  const dot = state === 'done' ? DONE : state === 'now' ? BRAND : WAIT
  const strong = state === 'wait' ? '400' : '600'
  const color = state === 'wait' ? FAINT : INK
  const label = (Array.isArray(lines) ? lines : [lines]).map(esc).join('<br>')
  return `
    <td width="${width}%" align="center" valign="top" style="padding:0 2px">
      <div style="width:9px;height:9px;border-radius:50%;background:${dot};margin:0 auto 7px"></div>
      <div style="font-size:11px;line-height:1.25;font-weight:${strong};color:${color}">${label}</div>
      <div style="font-size:10px;color:${state === 'wait' ? FAINT : MUTED};margin-top:2px">${esc(day ?? '—')}</div>
    </td>`
}

export function timeline(steps) {
  const width = Math.floor(100 / steps.length)
  const done = steps.filter(s => s.state === 'done').length
  const pct = Math.min(100, Math.round(((done + 0.5) / steps.length) * 100))
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0">
      <tr><td style="padding:0 0 10px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:separate;border-radius:99px;overflow:hidden">
          <tr>
            <td width="${pct}%" height="4" style="background:${DONE};font-size:0;line-height:0">&nbsp;</td>
            <td height="4" style="background:${WAIT};font-size:0;line-height:0">&nbsp;</td>
          </tr>
        </table>
      </td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>${steps.map(s => step(s, width)).join('')}</tr>
        </table>
      </td></tr>
    </table>`
}

/**
 * Onde cada etapa cai na régua de cinco casas.
 *
 * A quarta casa muda de nome conforme o momento: enquanto a mercadoria está
 * na fábrica ela se chama "Pronto para embarque"; depois que sai, "Embarcado".
 * Mesma posição, palavra verdadeira — cinco colunas é o que cabe no Gmail do
 * celular sem as palavras quebrarem em três linhas.
 */
export const STAGE_INDEX = {
  // A amostra é a casa zero: não é etapa do quadro de Orders, é o que vem
  // antes dele.
  'sample-approved': 0,
  'Placed': 1,
  'In Production': 2,
  'Ready to Ship': 3,
  'Collected': 3,
  'Shipped': 3,
  'Arrived': 4,
}

export function stageSteps(stage, dates) {
  const saiu = stage === 'Collected' || stage === 'Shipped' || stage === 'Arrived'
  const now = STAGE_INDEX[stage] ?? 1
  const quarto = saiu ? dates.shippedOn ?? dates.readyOn : dates.readyOn
  const ultimo = dates.arrivedOn ?? dates.arrival
  const base = [
    { lines: ['Amostra', 'aprovada'], day: shortDay(dates.sampleApprovedOn), month: monthShort(dates.sampleApprovedOn) },
    { lines: ['Pedido', 'confirmado'], day: shortDay(dates.placedOn), month: monthShort(dates.placedOn) },
    { lines: ['Em', 'produção'], day: shortDay(dates.productionOn), month: monthShort(dates.productionOn) },
    {
      lines: saiu ? ['Embarcado'] : ['Pronto para', 'embarque'],
      day: shortDay(quarto), month: monthShort(quarto),
    },
    { lines: ['Chegada', 'ao Brasil'], day: shortDay(ultimo), month: monthShort(ultimo) },
  ]
  // O que já aconteceu tem dia; o que ainda não aconteceu tem mês. É a
  // mesma honestidade da manchete: numa importação, dia futuro é chute com
  // cara de compromisso.
  return base.map((s, i) => {
    const state = i < now ? 'done' : i === now ? 'now' : 'wait'
    const day = state === 'wait' ? (s.month ?? null) : (s.day ?? null)
    return { lines: s.lines, state, day: day ?? (state === 'wait' ? 'previsto' : '—') }
  })
}

/** A manchete e a frase de abertura de cada etapa. */
const STAGE_COPY = {
  'Placed': {
    title: 'Seu pedido foi confirmado na fábrica',
    lead: 'Sua produção foi confirmada e já entrou na fila da fábrica.',
  },
  'In Production': {
    title: 'Seu pedido entrou em produção',
    lead: 'A fábrica começou a produzir o seu pedido.',
  },
  'Ready to Ship': {
    title: 'Seu pedido está pronto',
    lead: 'A produção terminou e a mercadoria aguarda embarque.',
  },
  'Collected': {
    title: 'Sua mercadoria foi coletada',
    lead: 'O transportador retirou a mercadoria da fábrica.',
  },
  'Shipped': {
    title: 'Sua mercadoria embarcou',
    lead: 'Sua mercadoria saiu da fábrica e está a caminho do Brasil.',
  },
  'Arrived': {
    title: 'Sua mercadoria chegou ao Brasil',
    lead: 'Sua mercadoria desembarcou e segue para a liberação.',
  },
  'reminder': {
    title: 'Como está seu pedido',
    lead: 'Um retrato de onde seu pedido está hoje.',
  },
  // A fábrica remarcou. O cliente recebe a data nova e nada mais: o motivo
  // escrito pela DEQI é a palavra da fábrica, e quem responde pelo prazo
  // diante do cliente é a Redantex. O vendedor, em cópia, tem a história
  // inteira no hub.
  // A amostra aprovada é o primeiro momento em que há o que contar: o relógio
  // dos 120 dias começa ali. Ainda não há data da fábrica, então a previsão
  // sai do plano — mais grossa, e honesta, porque é a promessa que já foi
  // feita.
  'sample-approved': {
    title: 'Sua amostra foi aprovada',
    lead: 'A amostra foi aprovada e seu pedido segue para a produção.',
  },
  // O dia em que a fábrica finalmente diz quando fica pronto. Sem este email
  // o cliente ficaria com a estimativa do plano para sempre, sem saber que
  // ela virou data de verdade.
  'date-confirmed': {
    title: 'A fábrica confirmou o prazo do seu pedido',
    lead: 'A fábrica confirmou quando seu pedido fica pronto, e a previsão de chegada está mais firme.'
  },
  'date-change': {
    title: 'Nova previsão de chegada do seu pedido',
    lead: 'A fábrica reprogramou a finalização do seu pedido, e a previsão de chegada mudou.'
  },
}

const AVULSOS = ['reminder', 'date-change', 'date-confirmed']
export const STAGES = Object.keys(STAGE_COPY).filter(k => !AVULSOS.includes(k))

/**
 * O email de uma etapa, ou o lembrete.
 *
 * @param {object} o
 * @param {string} o.stage   uma das etapas, ou 'reminder'
 * @param {string} o.client  nome do cliente, como ele se reconhece
 * @param {Array}  o.items   { size, quantity } — nada além disso sai
 * @param {string} o.sampleApprovedOn  YYYY-MM-DD
 * @param {string} o.placedOn
 * @param {string} o.productionOn
 * @param {string} o.readyOn   o dia que o fornecedor prometeu
 * @param {string} o.shippedOn
 * @param {string} o.arrivedOn
 * @param {number} o.logisticsDays  a meta de logística da Redantex
 * @param {string} o.salesperson    quem responde por este pedido
 * @param {string} o.today          YYYY-MM-DD, a data do email
 */
export function clientEmail(o) {
  const stage = o.stage ?? 'Placed'
  const copy = STAGE_COPY[stage] ?? STAGE_COPY.Placed
  const chegou = stage === 'Arrived'

  const items = (o.items ?? []).map(i => ({
    size: itemSize(i),
    quantity: Number(i.quantity ?? 0),
  }))
  const pieces = items.reduce((s, i) => s + i.quantity, 0)
  // Chegou > data da fábrica + logística > plano de 120 dias desde a amostra.
  // Cada degrau é mais firme que o de baixo, e o cliente sobe conforme o
  // pedido anda.
  const arrival = o.arrivedOn
    ?? (o.readyOn ? addDays(o.readyOn, o.logisticsDays ?? DEFAULT_LOGISTICS_DAYS) : null)
    ?? (o.sampleApprovedOn ? addDays(o.sampleApprovedOn, o.planDays ?? DEFAULT_PLAN_DAYS) : null)

  const steps = stageSteps(AVULSOS.includes(stage) ? (o.currentStage ?? 'Placed') : stage,
    { ...o, arrival })

  const head = `
    <tr>
      <td style="padding:0 0 4px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${FAINT}">Medida</td>
      <td style="padding:0 0 4px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${FAINT};text-align:right">Peças</td>
    </tr>`

  const rows = items.map(i => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${INK}">${esc(i.size)}</td>
      <td style="padding:7px 0;border-bottom:1px solid ${LINE};font-size:13px;text-align:right;font-weight:600;color:${INK};white-space:nowrap">${nf(i.quantity)}</td>
    </tr>`).join('')

  // O que já aconteceu tem dia. A previsão tem terço de mês, e vem com a
  // ressalva: é importação, e entre a fábrica e a porta do cliente há
  // embarque, navio e alfândega.
  // A previsão é dita como o vendedor diria: a faixa de dez dias em que a
  // mercadoria deve chegar, e a margem assumida em voz alta. Dia exato soa
  // como compromisso de entrega, e entre a fábrica e a porta do cliente há
  // embarque, navio e alfândega.
  const dec = arrival ? decendio(arrival) : null
  const previsao = dec ? `entre ${dec.de} e ${dec.ate} de ${dec.mes} de ${dec.ano}` : null
  const shownDate = chegou ? longDay(arrival) : previsao

  // Sem itens cadastrados não se anuncia uma lista que não vem: existe pelo
  // menos um card de amostra sem itens, e "São estes os itens:" seguido de
  // nada, com "Total: 0 peças", é o tipo de email que não se manda a cliente.
  // O `.trim()` não é zelo gratuito: estas frases já foram concatenadas em
  // várias linhas e sobrou espaço no fim de duas, que virou espaço dobrado
  // no meio da frase do cliente.
  const lead = items.length ? `${copy.lead.trim()} São estes os itens:` : copy.lead.trim()

  const dateLabel = chegou ? 'Chegada ao Brasil' : 'Previsão de chegada no Brasil'
  const dateHint = chegou
    ? 'Nossa equipe entrará em contato sobre a entrega.'
    : 'Trabalhamos com uma margem de cerca de dez dias, para mais ou para menos. '
      + 'É uma importação: o prazo depende do embarque e da liberação alfandegária, '
      + 'e acompanhamos cada passo com você.'

  const subject = chegou
    ? 'Sua mercadoria chegou ao Brasil'
    : `${copy.title} — chegada ${shownDate ?? 'a confirmar'}`

  const html = `<!doctype html>
<html lang="pt-BR" translate="no"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="google" content="notranslate" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e6ea;border-radius:10px">

        <tr><td style="padding:26px 28px 20px;border-bottom:1px solid ${LINE}">
          <div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${BRAND}">Redantex</div>
          <div style="font-size:20px;font-weight:650;color:${INK};margin-top:5px">${esc(copy.title)}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:2px">${esc(longDay(o.today) ?? '')}</div>
        </td></tr>

        <tr><td style="padding:22px 28px 0">
          <p style="margin:0;font-size:14px;line-height:1.6;color:${INK}">Olá, ${esc(o.client)}.</p>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:${INK}">${esc(lead)}</p>
          ${items.length === 0 ? '' : `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
            ${head}${rows}
            <tr>
              <td style="padding:8px 0 0;font-size:13px;font-weight:700;color:${INK}">Total</td>
              <td style="padding:8px 0 0;font-size:13px;font-weight:700;text-align:right;color:${INK};white-space:nowrap">${nf(pieces)} peças</td>
            </tr>
          </table>`}
        </td></tr>

        <tr><td style="padding:24px 28px 0">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">Onde seu pedido está</div>
          ${timeline(steps)}
        </td></tr>

        <tr><td style="padding:24px 28px 4px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(dateLabel)}</div>
          <div style="font-size:26px;font-weight:700;color:${INK};margin-top:3px">${esc(shownDate ?? 'a confirmar')}</div>
          <div style="font-size:12px;color:${FAINT};margin-top:2px">${esc(dateHint)}</div>
        </td></tr>

        <tr><td style="padding:22px 28px 26px">
          <div style="border-top:1px solid ${LINE};padding-top:14px;font-size:12px;color:${FAINT};line-height:1.5">
            Qualquer dúvida, responda este email — ele vai direto para ${esc(o.salesperson ?? 'seu contato')}, na Redantex.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    `Olá, ${o.client}.`,
    '',
    lead,
    ...(items.length ? [
      ...items.map(i => `  ${i.size} — ${nf(i.quantity)} peças`),
      `  Total: ${nf(pieces)} peças`,
    ] : []),
    '',
    `${dateLabel}: ${shownDate ?? 'a confirmar'}`,
    dateHint,
    '',
    `Qualquer dúvida, responda este email — ele vai direto para ${o.salesperson ?? 'seu contato'}, na Redantex.`,
  ].join('\n')

  // Uma linha do que este aviso informou, para a fila gravar no envio. O
  // painel de vendas mostra isto ao lado da data em que o email saiu; se
  // fosse recalculado na hora de exibir, mostraria a previsão de hoje em cima
  // de uma mensagem de outubro, e o vendedor leria que o cliente soube de uma
  // coisa que ninguém lhe disse.
  const resumo = chegou
    ? `Chegada confirmada em ${longDay(arrival)}`
    : previsao ? `Previsão informada: ${previsao}` : 'Previsão a confirmar'

  return { subject, html, text, pieces, arrival, resumo }
}

/**
 * Traduz uma linha de `cards` para o que o email precisa.
 *
 * Mora aqui, e não dentro da função do Netlify, por um motivo só: é onde se
 * decide qual coluna é **dia** e qual é **instante**, e errar isso põe a data
 * errada na frente do cliente. Já aconteceu nesta mesma função, antes de
 * alguém conferir os tipos:
 *
 *   `date`        sample_approved_at · order_confirmed_at · delivery_date · arrived_at
 *   `timestamptz` status_since · shipped_at
 *
 * Um `date` lido como instante vira meia-noite UTC e, em São Paulo, **o dia
 * anterior** — 8 de outubro vira 7. É a mesma armadilha que o CLAUDE.md
 * descreve nos prazos, e a razão de `plainDay` e `stampDay` existirem
 * separados em vez de uma função esperta que adivinha.
 */
export function cardToEmailInput(card, { stage, client, today, logisticsDays, planDays } = {}) {
  const plain = (v) => (v ? String(v).slice(0, 10) : undefined)
  const stamp = (v) => (v
    ? new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(v))
    : undefined)

  const items = (card?.card_items ?? [])
    .slice()
    .sort((a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0))
    .map(i => ({ size: i?.size, quantity: i?.quantity }))

  return {
    stage,
    currentStage: card?.status,
    client,
    // O cadastro de vendedores (056) manda; o login é a escada atrás, para os
    // cards que ninguém reabriu desde então.
    salesperson: (card?.sold_by?.name ?? card?.salesperson?.full_name)?.split(' ')?.[0],
    items,
    sampleApprovedOn: plain(card?.sample_approved_at),
    placedOn: plain(card?.order_confirmed_at),
    // Só sabemos quando a produção começou enquanto o card está nela:
    // `status_since` é reescrito na etapa seguinte. Depois disso a casa fica
    // sem data, em vez de mostrar a data de outra etapa.
    productionOn: card?.status === 'In Production' ? stamp(card?.status_since) : undefined,
    readyOn: plain(card?.delivery_date),
    shippedOn: stamp(card?.shipped_at),
    arrivedOn: plain(card?.arrived_at),
    today,
    ...(logisticsDays != null ? { logisticsDays } : {}),
    ...(planDays != null ? { planDays } : {}),
  }
}
