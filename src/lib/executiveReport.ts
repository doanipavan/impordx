import { ORDER_LEG_DAYS, LOGISTICS_TARGET_DAYS } from './utils'

/**
 * O relatório executivo da semana, em duas páginas.
 *
 * Quem lê são quatro pessoas que não abrem o hub todo dia — direção comercial,
 * operações e o CEO — num celular, pelo WhatsApp. Então ele responde quatro
 * perguntas nessa ordem e para:
 *
 *   1. Quanto está em jogo, e quando chega.
 *   2. O que andou nesta semana.
 *   3. O que precisa de decisão — e só isso, com nome e número de dias.
 *   4. O que vem antes de virar pedido.
 *
 * Duas páginas é o teto, não a meta: página 1 responde 1 e 2, página 2
 * responde 3 e 4. Nada de gráfico decorativo — quem quiser o detalhe abre o
 * hub, e o relatório diz onde.
 *
 * Os números chegam prontos de quem já sabe a régua (orderRows/orderTotals);
 * aqui só se desenha.
 */

export interface ExecKpi { label: string; value: string; hint?: string; tone?: 'late' | 'ok' | 'plain' }

export interface ExecMonth {
  month: string          // 'Dez 2026'
  orders: number
  pieces: number
  purchaseUsd: number
  saleBrl: number
}

export interface ExecAttention {
  client: string
  reference: string
  supplier?: string
  status: string
  days: string           // '14 dias em atraso'
  why: string            // por que está aqui
}

export interface ExecMoved { label: string; count: number }

export interface ExecFunnelRow { label: string; count: number; note?: string }

export interface ExecReport {
  periodLabel: string    // 'semana de 22 a 29 de setembro'
  /** Quantos ficaram de fora da lista de atenção, por serem os menos graves. */
  attentionHidden?: number
  generatedAt: string
  kpis: ExecKpi[]
  months: ExecMonth[]
  moved: ExecMoved[]
  attention: ExecAttention[]
  funnel: { quotes: ExecFunnelRow[]; samples: ExecFunnelRow[] }
  clientApprovals: { sent: number; approved: number; changes: number; waiting: number }
  /** Só aparece quando há pagamento registrado — senão a seção some. */
  payments?: { dueLabel: string; openUsd: number; nextDue?: string }
  logoDataUrl?: string | null
}

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const usd = (n: number) => 'US$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const num = (n: number) => n.toLocaleString('pt-BR')

export function executiveReportHtml(r: ExecReport): string {
  const totalPurchase = r.months.reduce((s, m) => s + m.purchaseUsd, 0)
  const totalSale = r.months.reduce((s, m) => s + m.saleBrl, 0)
  const totalOrders = r.months.reduce((s, m) => s + m.orders, 0)
  const totalPieces = r.months.reduce((s, m) => s + m.pieces, 0)

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório executivo — ${esc(r.periodLabel)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10px/1.45 -apple-system, "Segoe UI", Arial, sans-serif; color: #0f172a; }

  .head { display: flex; align-items: flex-start; gap: 12px; border-bottom: 2px solid #0f172a; padding-bottom: 7px; }
  .head img { height: 24px; }
  h1 { font-size: 15px; margin: 0; letter-spacing: -.01em; }
  .sub { color: #64748b; font-size: 9.5px; margin-top: 1px; }

  h2 { font-size: 9.5px; margin: 13px 0 5px; text-transform: uppercase; letter-spacing: .09em; color: #64748b; }
  h2 span { text-transform: none; letter-spacing: 0; font-weight: 400; }

  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px;
          width: 100%; max-width: 100%; padding-right: 1px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; }
  .kpi dt { font-size: 7.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #64748b; margin: 0; }
  .kpi dd { margin: 1px 0 0; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .kpi small { display: block; color: #64748b; font-size: 7.5px; margin-top: 1px; }
  .kpi.late dd { color: #b91c1c; } .kpi.late { border-color: #fecaca; background: #fef2f2; }
  .kpi.ok dd { color: #15803d; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 7.5px; text-transform: uppercase; letter-spacing: .05em; color: #64748b;
       padding: 3px 5px; border-bottom: 1px solid #0f172a; }
  td { padding: 3.5px 5px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr { break-inside: avoid; }
  .r { text-align: right; font-variant-numeric: tabular-nums; }
  .tot td { font-weight: 700; border-top: 1px solid #0f172a; border-bottom: 0; background: #f8fafc; }
  .late { color: #b91c1c; } .ok { color: #15803d; } .mut { color: #64748b; }

  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .moved { display: flex; flex-wrap: wrap; gap: 5px; }
  .moved span { border: 1px solid #e5e7eb; border-radius: 99px; padding: 2.5px 8px; font-size: 9px; }
  .moved b { font-variant-numeric: tabular-nums; }

  .note { color: #64748b; font-size: 8.5px; margin-top: 4px; }
  .empty { color: #64748b; font-size: 9px; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 8px 10px; }
  .page2 { break-before: page; page-break-before: always; padding-top: 2mm; }
  .foot { margin-top: 10px; padding-top: 5px; border-top: 1px solid #e5e7eb; color: #64748b; font-size: 8px;
          display: flex; justify-content: space-between; }
</style></head><body>

<div class="head">
  ${r.logoDataUrl ? `<img src="${r.logoDataUrl}" alt="Redantex">` : ''}
  <div>
    <h1>Relatório executivo — importação</h1>
    <div class="sub">${esc(r.periodLabel)} · gerado em ${esc(r.generatedAt)}</div>
  </div>
</div>

<dl class="kpis">
  ${r.kpis.map(k => `<div class="kpi ${k.tone ?? ''}">
    <dt>${esc(k.label)}</dt><dd>${esc(k.value)}</dd>${k.hint ? `<small>${esc(k.hint)}</small>` : ''}
  </div>`).join('')}
</dl>

<h2>Chegadas previstas <span>— quando a mercadoria entra no Brasil</span></h2>
${r.months.length === 0 ? '<p class="empty">Nenhum pedido com chegada prevista.</p>' : `
<table>
  <thead><tr>
    <th>Mês</th><th class="r">Pedidos</th><th class="r">Peças</th>
    <th class="r">Compra (USD)</th><th class="r">Venda (R$)</th>
  </tr></thead>
  <tbody>
    ${r.months.map(m => `<tr>
      <td>${esc(m.month)}</td>
      <td class="r">${num(m.orders)}</td>
      <td class="r">${num(m.pieces)}</td>
      <td class="r">${usd(m.purchaseUsd)}</td>
      <td class="r">${m.saleBrl > 0 ? brl(m.saleBrl) : '—'}</td>
    </tr>`).join('')}
    <tr class="tot">
      <td>Total</td><td class="r">${num(totalOrders)}</td><td class="r">${num(totalPieces)}</td>
      <td class="r">${usd(totalPurchase)}</td><td class="r">${totalSale > 0 ? brl(totalSale) : '—'}</td>
    </tr>
  </tbody>
</table>
<p class="note">Compra em USD é o que foi negociado com o fornecedor; venda em R$ é o preço ao cliente já registrado.</p>`}

<h2>O que andou nesta semana</h2>
${r.moved.length === 0
  ? '<p class="empty">Nenhuma movimentação registrada no período.</p>'
  : `<div class="moved">${r.moved.map(m => `<span><b>${num(m.count)}</b> ${esc(m.label)}</span>`).join('')}</div>`}

<h2>Aprovação de arte pelo cliente</h2>
<div class="moved">
  <span><b>${num(r.clientApprovals.sent)}</b> enviadas</span>
  <span><b>${num(r.clientApprovals.approved)}</b> aprovadas</span>
  <span><b>${num(r.clientApprovals.changes)}</b> com ajuste pedido</span>
  <span><b>${num(r.clientApprovals.waiting)}</b> aguardando resposta</span>
</div>

<div class="foot"><span>Impo RDX · impordx.netlify.app</span><span>página 1 de 2</span></div>

<div class="page2">
  <h2 style="margin-top:0">Precisa de decisão <span>— ${r.attention.length === 0 ? 'nada em aberto' : `${r.attention.length} ${r.attention.length === 1 ? 'pedido' : 'pedidos'}`}</span></h2>
  ${r.attention.length === 0 ? `
    <p class="empty">Nenhum pedido atrasado nem com data de fornecedor além do dia ${ORDER_LEG_DAYS}.</p>` : `
  <table>
    <thead><tr>
      <th>Cliente</th><th>Referência</th><th>Fornecedor</th><th>Etapa</th><th>Situação</th><th>Por quê</th>
    </tr></thead>
    <tbody>
      ${r.attention.map(a => `<tr>
        <td><b>${esc(a.client)}</b></td>
        <td class="mut">${esc(a.reference)}</td>
        <td class="mut">${esc(a.supplier ?? '—')}</td>
        <td>${esc(a.status)}</td>
        <td class="late">${esc(a.days)}</td>
        <td class="mut">${esc(a.why)}</td>
      </tr>`).join('')}
      ${r.attentionHidden ? `<tr><td colspan="6" class="mut">
        e mais ${num(r.attentionHidden)} ${r.attentionHidden === 1 ? 'pedido' : 'pedidos'} com desvio menor —
        a lista inteira está em impordx.netlify.app/timeline
      </td></tr>` : ''}
    </tbody>
  </table>`}

  <div class="two">
    <div>
      <h2>Antes do pedido <span>— cotações</span></h2>
      <table>
        <tbody>
          ${r.funnel.quotes.map(q => `<tr><td>${esc(q.label)}</td><td class="r">${num(q.count)}</td>
            <td class="mut">${esc(q.note ?? '')}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div>
      <h2>Antes do pedido <span>— amostras</span></h2>
      <table>
        <tbody>
          ${r.funnel.samples.map(q => `<tr><td>${esc(q.label)}</td><td class="r">${num(q.count)}</td>
            <td class="mut">${esc(q.note ?? '')}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  ${r.payments ? `
  <h2>Financeiro <span>— ${esc(r.payments.dueLabel)}</span></h2>
  <div class="moved">
    <span><b>${usd(r.payments.openUsd)}</b> em aberto</span>
    ${r.payments.nextDue ? `<span>próximo vencimento <b>${esc(r.payments.nextDue)}</b></span>` : ''}
  </div>` : ''}

  <h2>Como ler os prazos</h2>
  <p class="note" style="margin-top:0">
    O plano é de ${ORDER_LEG_DAYS * 2} dias a partir da aprovação da amostra (ou da proforma):
    ${ORDER_LEG_DAYS} dias para o fornecedor produzir e ${ORDER_LEG_DAYS} para chegar ao Brasil.
    Quando o fornecedor informa a data de produção pronta, a chegada passa a ser contada por ela mais
    ${LOGISTICS_TARGET_DAYS} dias, que é a meta de logística da Redantex. Um pedido entra em
    "precisa de decisão" quando estoura o prazo ou quando o fornecedor promete além do dia ${ORDER_LEG_DAYS}.
  </p>

  <div class="foot"><span>Detalhe pedido a pedido em impordx.netlify.app/timeline</span><span>página 2 de 2</span></div>
</div>

</body></html>`
}
