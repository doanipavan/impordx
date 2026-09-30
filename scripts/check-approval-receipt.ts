/**
 * O comprovante que a Redantex remonta, conferido sem banco e sem navegador.
 *
 *   node_modules/.bin/jiti scripts/check-approval-receipt.ts
 *
 * O documento é a prova de que o cliente aprovou. Os erros que importam aqui
 * são silenciosos: montar a peça a partir do card de hoje em vez do retrato
 * (o comprovante passaria a dizer outra coisa meses depois), trocar a ordem
 * da arte, ou deixar cair o código de conferência — sem ele o papel não pode
 * ser checado por ninguém de fora.
 */
import { approvalReceiptHtml, receiptFromSignature, receiptDateTime, StoredSignature, StoredFile }
  from '../src/lib/approvalReceipt'
import { TERMS_TITLE, TERMS_CONFIRMATION_N } from '../src/lib/approvalTerms'

let passed = 0
const failures: string[] = []
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const url = (p: string) => `https://exemplo.supabase.co/storage/v1/object/public/attachments/${p}`

const sig: StoredSignature = {
  decision: 'approved',
  signer_name: 'Isabela Cristina Carneiro Nogueira',
  signer_email: 'isabella.nogueira_@hotmail.com',
  signer_document: '01234567890',
  note: null,
  signed_at: '2026-09-30T15:09:43.000Z',
  accepted_terms: true,
  verify_code: '858B3390AF',
  snapshot: {
    reference: 'ORD-2026-10095',
    title: 'OURO1000TON',
    client: 'OURO1000TON',
    terms: { order: 'ORD-2026-10095', artVersion: 'OURO Design.jpg', date: '30/09/2026' },
  },
}

const files: StoredFile[] = [
  { id: 'b', filename: 'verso.jpg', file_url: 'pasta/verso.jpg' },
  { id: 'a', filename: 'OURO Design.jpg', file_url: 'pasta/frente.jpg' },
]

// ------------------------------------------------------------- a montagem

const r = receiptFromSignature(sig, ['a', 'b'], files, url)

check('a peça vem do retrato, não do card de hoje', r.piece.reference === 'ORD-2026-10095')
check('o cliente vem do retrato', r.piece.client === 'OURO1000TON')
check('os campos do termo vêm do retrato', r.terms.artVersion === 'OURO Design.jpg')
check('a arte sai na ordem do link, não na do banco',
  r.art.map(a => a.caption).join() === 'OURO Design.jpg,verso.jpg', r.art.map(a => a.caption).join())
check('a arte aponta para o arquivo certo', r.art[0].url.endsWith('pasta/frente.jpg'))
check('o código de conferência entra', r.signature.verifyCode === '858B3390AF')
check('o CPF entra', r.signature.document === '01234567890')
check('o aceite do termo entra', r.signature.acceptedTerms === true)

// Um card apagado leva junto os anexos; o comprovante ainda tem de sair.
const semArte = receiptFromSignature(sig, ['a', 'b'], [], url)
check('sem os arquivos, ainda monta', semArte.art.length === 0 && !!semArte.piece.reference)

// Um retrato antigo, de antes de o termo existir, não pode derrubar a página.
const semRetrato = receiptFromSignature({ ...sig, snapshot: null }, [], [], url)
check('sem retrato, não quebra', semRetrato.piece.reference === '—' && semRetrato.terms.order === '—')

check('decisão desconhecida não vira aprovação por acidente',
  receiptFromSignature({ ...sig, decision: 'changes' }, [], [], url).signature.decision === 'changes')

// ------------------------------------------------------------ a data e hora

const quando = receiptDateTime('2026-09-30T15:09:43.000Z')
check('a hora é a de São Paulo, não a do computador',
  quando.includes('12:09'), quando)
check('a data diz de onde é', quando.includes('(horário de Brasília)'))
check('a data sai em português', quando.includes('setembro'), quando)

// -------------------------------------------------------------- o documento

const html = approvalReceiptHtml(r)

check('o termo é o mesmo de approvalTerms', html.includes(TERMS_TITLE))
check('a confirmação do cliente é a última seção',
  html.includes(`${TERMS_CONFIRMATION_N}. Confirmação do cliente`))
check('diz que foi aprovada', html.includes('Arte aprovada pelo cliente'))
check('mostra quem assinou', html.includes('Isabela Cristina Carneiro Nogueira'))
check('mostra o e-mail', html.includes('isabella.nogueira_@hotmail.com'))
check('mostra a data em São Paulo', html.includes('12:09'))
check('mostra o código de conferência', html.includes('858B3390AF'))
check('ensina como conferir', html.includes('impordx.netlify.app/verificar'))
check('a arte entra como imagem', (html.match(/<figure>/g) ?? []).length === 2)
check('sai em português para impressão', html.includes('<html lang="pt-BR"'))
check('sai em A4', html.includes('size: A4'))

const mudanca = approvalReceiptHtml(receiptFromSignature(
  { ...sig, decision: 'changes', note: 'A cor está fora do pantone', accepted_terms: false },
  ['a'], files, url))
check('um ajuste não é impresso como aprovação',
  mudanca.includes('Ajuste solicitado pelo cliente') && !mudanca.includes('Arte aprovada pelo cliente'))
check('o motivo do ajuste sai no papel', mudanca.includes('A cor está fora do pantone'))
check('sem aceite do termo, não finge que houve', !mudanca.includes('Aceito na mesma assinatura'))

// Nome de cliente com & ou < viraria HTML solto no meio do documento.
const hostil = approvalReceiptHtml(receiptFromSignature(
  { ...sig, signer_name: 'A & B <script>alert(1)</script>' }, [], [], url))
check('nome hostil não injeta HTML',
  hostil.includes('A &amp; B &lt;script&gt;') && !hostil.includes('<script>alert'))

// ------------------------------------------------------------------ fim

console.log(`${passed} de ${passed + failures.length} conferências passaram`)
if (failures.length) {
  console.error('\nfalhou:')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
