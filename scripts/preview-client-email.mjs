/**
 * Desenha todos os emails do cliente num arquivo, sem mandar nada a ninguém.
 *
 *   node scripts/preview-client-email.mjs > /tmp/emails.html
 *
 * Os dados são os reais do ORD-2026-10107 (OURO DO BRASIL), lidos do banco em
 * 8 Out 2026 e fixados aqui de propósito: é um molde para julgar o desenho, e
 * um molde que muda sozinho não serve para comparar duas versões.
 *
 * Cada email sai num iframe próprio, que é a única forma honesta de ver um
 * email dentro de uma página — documento isolado, estilos sem vazamento.
 */
import { clientEmail, STAGES } from '../netlify/lib/clientEmail.mjs'

const PEDIDO = {
  client: 'OURO DO BRASIL',
  salesperson: 'Patrick',
  sampleApprovedOn: '2026-10-07',
  placedOn: '2026-10-08',
  productionOn: '2026-10-20',
  readyOn: '2026-11-25',
  logisticsDays: 50,
  items: [
    { size: '7,5 x 5 x 3,7 cm', quantity: 600 },
    { size: '4,6 x 5,2 x 3,8 cm', quantity: 600 },
    { size: '7 x 8 x 3,2 cm', quantity: 1200 },
  ],
}

// O dia em que cada aviso sairia, se o pedido andasse no prazo.
const QUANDO = {
  'Placed': '2026-10-08',
  'In Production': '2026-10-20',
  'Ready to Ship': '2026-11-25',
  'Collected': '2026-11-27',
  'Shipped': '2026-12-02',
  'Arrived': '2027-01-14',
}

const casos = [
  ...STAGES.map(stage => ({
    stage,
    titulo: `Etapa — ${stage}`,
    mail: clientEmail({
      ...PEDIDO,
      stage,
      today: QUANDO[stage],
      shippedOn: stage === 'Shipped' || stage === 'Arrived' ? '2026-12-02' : undefined,
      arrivedOn: stage === 'Arrived' ? '2027-01-14' : undefined,
    }),
  })),
  {
    stage: 'reminder',
    titulo: 'Lembrete — quinze dias sem notícia',
    mail: clientEmail({ ...PEDIDO, stage: 'reminder', currentStage: 'In Production', today: '2026-11-04' }),
  },
]

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cartoes = casos.map(c => `
  <section>
    <header>
      <h2>${esc(c.titulo)}</h2>
      <p class="assunto"><span>Assunto</span> ${esc(c.mail.subject)}</p>
    </header>
    <iframe sandbox="" srcdoc="${esc(c.mail.html)}" loading="lazy"></iframe>
  </section>`).join('')

process.stdout.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Inter,system-ui,sans-serif; background:#eceff1; color:#0f172a;
         padding:22px 20px 40px; }
  h1 { font-size:19px; font-weight:700; letter-spacing:-.2px; }
  .sub { font-size:12.5px; color:#64748b; margin-top:3px; max-width:900px; line-height:1.5; }
  .sub b { color:#0f172a; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:18px;
          margin-top:20px; max-width:1180px; }
  section { border:1px solid #e3e6ea; border-radius:10px; background:#fff; overflow:hidden; }
  header { padding:11px 14px; border-bottom:1px solid #eceef1; }
  h2 { font-size:12.5px; font-weight:700; }
  .assunto { font-size:11px; color:#64748b; margin-top:4px; line-height:1.4; }
  .assunto span { font-size:8.5px; text-transform:uppercase; letter-spacing:.07em;
                  font-weight:700; color:#9aa1ab; display:block; }
  iframe { width:100%; height:760px; border:0; display:block; background:#f5f6f7; }
</style></head>
<body>
  <h1>Os sete emails do cliente</h1>
  <p class="sub">Dados reais do <b>ORD-2026-10107 · OURO DO BRASIL</b> — 3 itens, 2.400 peças, pronto
     prometido para 25 de novembro. Cada cartão é o email como ele chegaria, na data em que sairia.
     <b>Nada foi enviado.</b></p>
  <div class="grid">${cartoes}</div>
</body></html>
`)
