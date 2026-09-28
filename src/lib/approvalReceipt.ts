import {
  TERMS_TITLE, TERMS_INTRO, TERMS_SECTIONS, TERMS_CONFIRMATION, TERMS_SIGNATORY, TermsFields,
} from './approvalTerms'

/**
 * O comprovante: o termo inteiro, com os campos preenchidos, a arte que foi
 * aprovada e quem assinou — pronto para a janela de impressão salvar em PDF.
 *
 * O texto vem de approvalTerms, o mesmo que o cliente leu na tela. Reescrever
 * o termo aqui seria o caminho para alguém assinar uma versão e guardar outra.
 */

export interface ReceiptInput {
  piece: { reference: string; title: string; client: string }
  terms: TermsFields
  art: Array<{ url: string; caption?: string }>
  signature: {
    decision: 'approved' | 'changes'
    name: string
    email: string
    at: string
    note?: string
    acceptedTerms?: boolean
  }
  logoDataUrl?: string | null
}

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function approvalReceiptHtml(r: ReceiptInput): string {
  const approved = r.signature.decision === 'approved'

  const sections = TERMS_SECTIONS.map(s => `
    <h2>${s.n}. ${esc(s.heading)}</h2>
    ${(s.body ?? []).map(t => `<p>${esc(t)}</p>`).join('')}
    ${s.bullets ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
  `).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Termo de aprovação — ${esc(r.piece.reference)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10.5px/1.5 -apple-system, "Segoe UI", Arial, sans-serif; color: #0f172a; }
  .head { display: flex; align-items: flex-start; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
  .head img { height: 26px; }
  h1 { font-size: 15px; margin: 0; line-height: 1.25; }
  .sub { color: #64748b; font-size: 10px; margin-top: 2px; }
  .verdict { margin: 12px 0; padding: 10px 12px; border-radius: 6px; border: 2px solid;
             border-color: ${approved ? '#16a34a' : '#f59e0b'}; background: ${approved ? '#f0fdf4' : '#fffbeb'}; }
  .verdict b { font-size: 12px; color: ${approved ? '#14532d' : '#78350f'}; }
  dl { display: grid; grid-template-columns: 130px 1fr; gap: 3px 10px; margin: 8px 0 0; }
  dt { color: #64748b; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; }
  dd { margin: 0; font-weight: 600; }
  h2 { font-size: 10.5px; margin: 10px 0 3px; text-transform: uppercase; letter-spacing: .05em; }
  p { margin: 0 0 4px; }
  ul { margin: 2px 0 4px; padding-left: 16px; }
  li { margin-bottom: 1px; }
  .fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0;
            border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .fields div span { display: block; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
  .fields div b { font-size: 11px; }
  figure { margin: 10px 0; page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
  figure img { display: block; width: 100%; max-height: 150mm; object-fit: contain; background: #fff; }
  figcaption { font-size: 9px; color: #64748b; padding: 4px 8px; border-top: 1px solid #e5e7eb; }
  .sign { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e5e7eb; page-break-inside: avoid; }
  .foot { margin-top: 12px; padding-top: 6px; border-top: 1px solid #e5e7eb; color: #64748b; font-size: 8.5px;
          display: flex; justify-content: space-between; }
</style></head><body>

<div class="head">
  ${r.logoDataUrl ? `<img src="${r.logoDataUrl}" alt="Redantex">` : ''}
  <div>
    <h1>${esc(TERMS_TITLE)}</h1>
    <div class="sub">${esc(r.piece.title)} · ${esc(r.piece.client)}</div>
  </div>
</div>

<div class="verdict">
  <b>${approved ? 'Arte aprovada pelo cliente' : 'Ajuste solicitado pelo cliente'}</b>
  <dl>
    <dt>Assinado por</dt><dd>${esc(r.signature.name)}</dd>
    <dt>E-mail</dt><dd>${esc(r.signature.email)}</dd>
    <dt>Data e hora</dt><dd>${esc(r.signature.at)}</dd>
    ${r.signature.acceptedTerms ? '<dt>Termo</dt><dd>Aceito na mesma assinatura</dd>' : ''}
    ${r.signature.note ? `<dt>Pedido</dt><dd>${esc(r.signature.note)}</dd>` : ''}
  </dl>
</div>

<div class="fields">
  <div><span>Pedido</span><b>${esc(r.terms.order)}</b></div>
  <div><span>Versão da arte aprovada</span><b>${esc(r.terms.artVersion)}</b></div>
  <div><span>Data da aprovação</span><b>${esc(r.terms.date)}</b></div>
</div>

${r.art.map(a => `<figure><img src="${a.url}" alt="">${a.caption ? `<figcaption>${esc(a.caption)}</figcaption>` : ''}</figure>`).join('')}

<p>${esc(TERMS_INTRO)}</p>
${sections}

<h2>6. Confirmação do cliente</h2>
${TERMS_CONFIRMATION.map(t => `<p>${esc(t)}</p>`).join('')}

<div class="sign">
  <dl>
    <dt>Cliente</dt><dd>${esc(r.signature.name)}</dd>
    <dt>Data</dt><dd>${esc(r.terms.date)}</dd>
  </dl>
  <p style="margin-top:8px">${esc(TERMS_SIGNATORY)}</p>
</div>

<div class="foot">
  <span>impordx.netlify.app · aceite eletrônico registrado com nome, e-mail, data, hora e IP</span>
  <span>${esc(r.piece.reference)}</span>
</div>
</body></html>`
}
