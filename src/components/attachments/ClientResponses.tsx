import { useEffect, useState } from 'react'
import { CheckCircle2, MessageSquareWarning, Clock, FileDown, Loader2 } from 'lucide-react'
import { useClientResponses, useApprovalReceipt } from '../../hooks/useApproval'
import { approvalReceiptHtml } from '../../lib/approvalReceipt'
import { formatDateTime, cn } from '../../lib/utils'

/**
 * O que o cliente respondeu, no topo dos arquivos.
 *
 * O primeiro pedido de ajuste que chegou de verdade ficou invisível: o sino
 * dizia que ele "pediu ajuste" e o histórico repetia a mesma frase, enquanto
 * o motivo — a cor fora do pantone — estava gravado onde ninguém abriu. Um
 * pedido que não se lê não é um pedido; é um card parado.
 *
 * A resposta mais recente vem aberta; as anteriores ficam listadas abaixo,
 * porque a segunda rodada de arte só faz sentido ao lado da primeira.
 *
 * O comprovante e o código ficam aqui pelo mesmo motivo. O PDF saía uma vez
 * só, na tela do cliente, e o código de conferência não aparecia em lugar
 * nenhum do hub — a página /verificar existia sem ninguém ter o que digitar
 * nela. A prova estava inteira no banco e não saía de lá.
 */
export function ClientResponses({ cardId }: { cardId: string }) {
  const { data: responses = [] } = useClientResponses(cardId)
  if (responses.length === 0) return null

  const [latest, ...older] = responses
  const changes = latest.decision === 'changes'

  return (
    <section className={cn('rounded-lg border-2 p-3 space-y-2',
      changes ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50')}>
      <div className="flex items-center gap-2">
        {changes
          ? <MessageSquareWarning className="h-4 w-4 text-amber-700 shrink-0" />
          : <CheckCircle2 className="h-4 w-4 text-green-700 shrink-0" />}
        <p className={cn('text-sm font-semibold', changes ? 'text-amber-900' : 'text-green-900')}>
          {changes ? 'Client asked for a change' : 'Client approved the art'}
        </p>
        <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
          {formatDateTime(latest.signed_at)}
        </span>
      </div>

      {latest.note && (
        <p className="text-sm text-foreground bg-card border border-border rounded-md px-3 py-2 whitespace-pre-wrap">
          {latest.note}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        {latest.signer_name} · {latest.signer_email}
        {latest.accepted_terms && ' · accepted the term'}
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <ReceiptButton id={latest.id} />
        {latest.verify_code && <VerifyCode code={latest.verify_code} />}
      </div>

      {older.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {older.length} {older.length === 1 ? 'earlier reply' : 'earlier replies'}
          </summary>
          <ul className="mt-1.5 space-y-2">
            {older.map(r => (
              <li key={r.id} className="flex gap-2 text-muted-foreground">
                <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <b className={r.decision === 'changes' ? 'text-amber-800' : 'text-green-800'}>
                    {r.decision === 'changes' ? 'Change requested' : 'Approved'}
                  </b>
                  {' · '}{formatDateTime(r.signed_at)}{' · '}{r.signer_name}
                  {r.note && <span className="block text-foreground/80">{r.note}</span>}
                  <span className="flex flex-wrap items-center gap-2 mt-1">
                    <ReceiptButton id={r.id} />
                    {r.verify_code && <VerifyCode code={r.verify_code} />}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** O código que um terceiro digita em /verificar para conferir a assinatura. */
function VerifyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" title="Copy the verification code"
      onClick={() => {
        navigator.clipboard?.writeText(code).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        }, () => {})
      }}
      className="text-[10px] font-mono tracking-wider px-2 py-1 rounded border border-border
                 bg-card text-muted-foreground hover:text-foreground">
      {copied ? 'copied' : code}
    </button>
  )
}

/**
 * Baixa o mesmo comprovante que o cliente recebeu.
 *
 * A janela abre no clique, antes de buscar qualquer coisa: abrir depois da
 * resposta do banco é exatamente o que o bloqueador de pop-up barra. Ela fica
 * em branco por um instante e recebe o documento quando ele fica pronto.
 */
function ReceiptButton({ id }: { id: string }) {
  const [wanted, setWanted] = useState(false)
  const [win, setWin] = useState<Window | null>(null)
  const { data, error } = useApprovalReceipt(wanted ? id : undefined)

  useEffect(() => {
    if (!win || (!data && !error)) return

    if (error || !data) {
      win.close()
      setWin(null)
      setWanted(false)
      return
    }

    win.document.write(approvalReceiptHtml(data))
    win.document.close()
    printWhenLoaded(win)
    setWin(null)
    setWanted(false)
  }, [win, data, error])

  const busy = wanted && !data && !error

  return (
    <button type="button" disabled={busy}
      onClick={() => {
        const opened = window.open('', '_blank')
        if (!opened) { alert('Allow pop-ups to download the receipt.'); return }
        opened.document.write('<title>Termo de aprovação</title>')
        setWin(opened)
        setWanted(true)
      }}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded
                 border border-border bg-card hover:bg-muted disabled:opacity-60">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
      Receipt (PDF)
    </button>
  )
}

/**
 * Espera a arte carregar antes de chamar a impressão.
 *
 * O comprovante do cliente imprimia depois de 600 ms fixos e dava certo porque
 * a arte já estava no cache do navegador dele — ele acabara de olhar para ela.
 * Aqui não está: um tempo fixo imprime o PDF com o quadro da imagem vazio,
 * que é o único conteúdo que o documento realmente precisa provar.
 */
function printWhenLoaded(win: Window, tries = 0) {
  const images = Array.from(win.document.images)
  if (images.every(i => i.complete) || tries > 40) {
    win.focus()
    win.print()
    return
  }
  setTimeout(() => printWhenLoaded(win, tries + 1), 150)
}
