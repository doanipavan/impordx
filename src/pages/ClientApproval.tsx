import { useState } from 'react'
import { Check, PencilLine, ShieldCheck, Clock, Download, AlertCircle, ZoomIn, FileText } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  TERMS_TITLE, TERMS_INTRO, TERMS_SECTIONS, TERMS_CONFIRMATION, TERMS_SIGNATORY,
  TERMS_CHECKBOX_LABEL, TermsFields,
} from '../lib/approvalTerms'
import { approvalReceiptHtml } from '../lib/approvalReceipt'
import { useSignApproval } from '../hooks/useApproval'

/**
 * A página que o cliente abre pelo link — a única tela do hub fora do login.
 *
 * **Em português, de propósito.** O resto do hub é em inglês porque o
 * fornecedor lê; esta tela só é vista pelo cliente brasileiro, e mandar um
 * pedido de aprovação em inglês para ele seria o erro contrário.
 *
 * **Só a arte.** Nada de referências, materiais soltos, cotações ou fotos de
 * bastidor — o cliente vê exatamente os arquivos que foram escolhidos no
 * momento de gerar o link, e mais nada. Sem preço, sem fornecedor, sem outros
 * cards. O que chega aqui é o que a função do banco entrega para aquele token,
 * não um card inteiro com campos escondidos no navegador.
 */

export interface ApprovalPiece {
  reference: string
  title: string
  client: string
  /** A arte, na ordem escolhida. Normalmente um arquivo só. */
  art: Array<{ url: string; caption?: string }>
  /** A ficha só aparece se quem gerou o link pediu. */
  specs?: Array<{ label: string; value: string }>
  notes?: string
  expiresOn: string
  sentBy: string
  /** Pedido, versão da arte e data — os campos que o termo em papel deixa em branco. */
  terms: TermsFields
}

export interface SignedReceipt {
  decision: 'approved' | 'changes'
  name: string
  email: string
  at: string
  note?: string
  /** Fica no comprovante: a aprovação e o aceite do termo são um ato só. */
  acceptedTerms?: boolean
}

type Stage = 'reviewing' | 'asking' | 'done'

export function ClientApproval({ piece, token, initial }: {
  piece: ApprovalPiece
  /** Ausente só no desenho: sem token não há o que assinar. */
  token?: string
  initial?: SignedReceipt
}) {
  const signApproval = useSignApproval(token)
  const [failure, setFailure] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>(initial ? 'done' : 'reviewing')
  const [receipt, setReceipt] = useState<SignedReceipt | undefined>(initial)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [note, setNote] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  // Imagens que o navegador não conseguiu desenhar.
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  const identified = name.trim().length > 2 && /.+@.+\..+/.test(email)
  // Aprovar a arte e aceitar o termo são duas caixinhas: uma diz o que ele viu,
  // a outra diz sob que condições. Juntas numa só, ninguém sabe o que assinou.
  const canApprove = identified && agreed && acceptedTerms
  const canAskChanges = identified && note.trim().length > 5

  async function sign(decision: 'approved' | 'changes') {
    setFailure(null)
    const local: SignedReceipt = {
      decision, name: name.trim(), email: email.trim(),
      at: new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date()) + ' (horário de Brasília)',
      note: decision === 'changes' ? note.trim() : undefined,
      acceptedTerms: decision === 'approved' ? acceptedTerms : undefined,
    }

    if (token) {
      try {
        await signApproval.mutateAsync({
          name: local.name, email: local.email, decision,
          acceptedTerms: decision === 'approved' ? acceptedTerms : false,
          note: local.note,
          // O retrato do que ele viu: é sobre isto que o banco calcula o hash.
          snapshot: {
            reference: piece.reference, title: piece.title, client: piece.client,
            art: piece.art.map(a => a.caption ?? a.url),
            specs: piece.specs ?? null,
            terms: { ...piece.terms, title: TERMS_TITLE },
          },
        })
      } catch (err) {
        console.error('Falha ao assinar:', err)
        setFailure((err as { message?: string })?.message
          ?? 'Não foi possível registrar sua resposta. Tente de novo em alguns instantes.')
        return
      }
    }

    setReceipt(local)
    setStage('done')
  }

  // O comprovante sai pela janela de impressão — a mesma mecânica do Export
  // RFQ, e sem depender de biblioteca de PDF no celular do cliente.
  function downloadReceipt(r: SignedReceipt) {
    const win = window.open('', '_blank')
    if (!win) { setFailure('Libere as janelas pop-up para baixar o comprovante.'); return }
    win.document.write(approvalReceiptHtml({
      piece: { reference: piece.reference, title: piece.title, client: piece.client },
      terms: piece.terms,
      art: piece.art,
      signature: r,
    }))
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 600)
  }

  return (
    <div className="min-h-screen bg-[#faf9f8]">
      <header className="bg-card border-b border-border">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center gap-3">
          <img src="/logo.webp" alt="Redantex" className="h-7 object-contain" />
          <div className="ml-auto text-right min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aprovação de arte</p>
            <p className="text-xs font-mono truncate">{piece.reference}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold leading-tight">{piece.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{piece.client}</p>
        </div>

        {stage === 'done' && receipt ? (
          <Receipt receipt={receipt} piece={piece} onDownload={() => downloadReceipt(receipt)} />
        ) : (
          <p className="text-sm text-foreground/80 bg-card border border-border rounded-lg p-3.5">
            {piece.sentBy} enviou esta arte para a sua aprovação.
            <strong> A produção começa depois do seu aceite</strong> — e é exatamente esta arte que
            será produzida.
          </p>
        )}

        {/* A arte, grande. Uma peça por vez, inteira: cortar em quadradinho é o
            jeito de o cliente aprovar um detalhe que não viu. */}
        <section className="space-y-2">
          {piece.art.map((a, i) => (
            <figure key={i} className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Um arquivo que o navegador não desenha — PDF, ou uma imagem
                  num formato que ele não lê — ainda precisa ser conferido:
                  então vira um botão para abrir em vez de um quadro vazio. */}
              {broken[a.url] ? (
                <a href={a.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-6 text-sm font-medium text-primary hover:bg-accent">
                  <FileText className="h-5 w-5 shrink-0" />
                  Abrir a arte ({a.caption ?? 'arquivo'})
                </a>
              ) : (
              <button type="button" onClick={() => setZoom(a.url)}
                className="block w-full relative group">
                <img src={a.url} alt={a.caption ?? 'Arte'} className="w-full object-contain max-h-[70vh] bg-white"
                  onError={() => setBroken(b => ({ ...b, [a.url]: true }))}
                  onLoad={e => { if (!(e.currentTarget as HTMLImageElement).naturalWidth) setBroken(b => ({ ...b, [a.url]: true })) }} />
                <span className="absolute bottom-2 right-2 flex items-center gap-1 text-[11px] font-medium
                                 bg-black/60 text-white rounded-full px-2 py-1">
                  <ZoomIn className="h-3 w-3" /> ampliar
                </span>
              </button>
              )}
              {a.caption && (
                <figcaption className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border/70 truncate">
                  {a.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </section>

        {/* A ficha é opcional: só vem quando quem gerou o link pediu. */}
        {piece.specs && piece.specs.length > 0 && (
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-4 pt-3.5 pb-2">
              Ficha da peça
            </h2>
            <dl className="divide-y divide-border/70">
              {piece.specs.map(s => (
                <div key={s.label} className="flex gap-4 px-4 py-2.5">
                  <dt className="text-xs text-muted-foreground w-36 shrink-0">{s.label}</dt>
                  <dd className="text-sm font-medium min-w-0">{s.value}</dd>
                </div>
              ))}
            </dl>
            {piece.notes && (
              <p className="text-xs text-muted-foreground border-t border-border/70 px-4 py-2.5 whitespace-pre-wrap">
                {piece.notes}
              </p>
            )}
          </section>
        )}

        {/* O termo, por extenso e rolável. Escondido atrás de um link, vira
            aquilo que ninguém abriu e mesmo assim assinou. */}
        {stage !== 'done' && <TermsBox fields={piece.terms} />}

        {stage !== 'done' && (
          <section className="bg-card border-2 border-primary/30 rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold">Sua resposta</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Seu nome completo</span>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm
                             focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Como assina" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Seu e-mail</span>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                  className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm
                             focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="para receber o comprovante" />
              </label>
            </div>

            {stage === 'reviewing' ? (
              <>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={agreed} onChange={() => setAgreed(v => !v)}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0" />
                  <span className="text-xs leading-snug">
                    Declaro que conferi a arte acima e <strong>aprovo a produção</strong> exatamente como
                    apresentada.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={acceptedTerms} onChange={() => setAcceptedTerms(v => !v)}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0" />
                  <span className="text-xs leading-snug">{TERMS_CHECKBOX_LABEL}</span>
                </label>

                <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
                  <button type="button" disabled={!canApprove || signApproval.isPending}
                    onClick={() => sign('approved')}
                    className={cn('h-11 px-5 rounded-md font-semibold text-sm flex items-center justify-center gap-2 flex-1',
                      canApprove && !signApproval.isPending ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                    {signApproval.isPending
                      ? <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <Check className="h-4 w-4" />}
                    Aprovo a arte
                  </button>
                  <button type="button" onClick={() => setStage('asking')}
                    className="h-11 px-5 rounded-md font-semibold text-sm flex items-center justify-center gap-2
                               border border-input bg-background hover:bg-accent">
                    <PencilLine className="h-4 w-4" /> Peço um ajuste
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">O que precisa mudar?</span>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none
                               focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Ex.: o dourado do logo está mais claro do que na referência" />
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" disabled={!canAskChanges || signApproval.isPending}
                    onClick={() => sign('changes')}
                    className={cn('h-11 px-5 rounded-md font-semibold text-sm flex-1',
                      canAskChanges && !signApproval.isPending ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                    {signApproval.isPending ? 'Registrando...' : 'Enviar pedido de ajuste'}
                  </button>
                  <button type="button" onClick={() => setStage('reviewing')}
                    className="h-11 px-5 rounded-md text-sm text-muted-foreground hover:bg-accent">
                    Voltar
                  </button>
                </div>
              </>
            )}

            {failure && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {failure}
              </p>
            )}

            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1 border-t border-border/70">
              <ShieldCheck className="h-3.5 w-3.5 mt-px shrink-0" />
              Ao responder, ficam registrados seu nome, e-mail, data e hora, e uma cópia exata
              do que está nesta tela. Você recebe o comprovante em PDF.
            </p>
          </section>
        )}

        <footer className="text-[11px] text-muted-foreground flex items-center gap-1.5 pb-8">
          <Clock className="h-3.5 w-3.5" />
          Este link é exclusivo desta arte e expira em {piece.expiresOn}.
        </footer>
      </main>

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-[92vh] max-w-full object-contain rounded" />
        </div>
      )}
    </div>
  )
}

function TermsBox({ fields }: { fields: TermsFields }) {
  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold leading-tight">{TERMS_TITLE}</h2>
      </div>

      {/* Os campos que o papel deixava em branco, já preenchidos. */}
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 px-4 py-3 bg-muted/40 border-b border-border">
        <Field k="Pedido" v={fields.order} />
        <Field k="Versão da arte" v={fields.artVersion} />
        <Field k="Data da aprovação" v={fields.date} />
      </dl>

      <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-3 text-xs leading-relaxed text-foreground/90">
        <p>{TERMS_INTRO}</p>
        {TERMS_SECTIONS.map(sec => (
          <div key={sec.n}>
            <h3 className="font-semibold uppercase tracking-wide text-[11px] mb-1">
              {sec.n}. {sec.heading}
            </h3>
            {sec.body?.map((t, i) => <p key={i} className="mb-1">{t}</p>)}
            {sec.bullets && (
              <ul className="list-disc pl-4 space-y-0.5">
                {sec.bullets.map(b => <li key={b}>{b}</li>)}
              </ul>
            )}
          </div>
        ))}
        <div>
          <h3 className="font-semibold uppercase tracking-wide text-[11px] mb-1">6. Confirmação do cliente</h3>
          {TERMS_CONFIRMATION.map((t, i) => <p key={i} className="mb-1">{t}</p>)}
        </div>
        <p className="text-muted-foreground pt-1 border-t border-border/70">{TERMS_SIGNATORY}</p>
      </div>

      <p className="text-[11px] text-muted-foreground px-4 py-2 border-t border-border bg-muted/20">
        Role para ler o termo completo. Ele vai junto no comprovante em PDF.
      </p>
    </section>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="text-xs font-medium truncate">{v}</dd>
    </div>
  )
}

function Receipt({ receipt, piece, onDownload }: {
  receipt: SignedReceipt; piece: ApprovalPiece; onDownload: () => void
}) {
  const approved = receipt.decision === 'approved'
  return (
    <section className={cn('rounded-lg border-2 p-4',
      approved ? 'border-green-500 bg-green-50' : 'border-amber-400 bg-amber-50')}>
      <div className="flex items-center gap-2">
        {approved
          ? <Check className="h-5 w-5 text-green-700 shrink-0" />
          : <AlertCircle className="h-5 w-5 text-amber-700 shrink-0" />}
        <p className={cn('font-semibold', approved ? 'text-green-900' : 'text-amber-900')}>
          {approved ? 'Arte aprovada' : 'Ajuste solicitado'}
        </p>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Line k="Peça" v={`${piece.title} · ${piece.reference}`} />
        <Line k="Assinado por" v={`${receipt.name} · ${receipt.email}`} />
        <Line k="Quando" v={receipt.at} />
        {receipt.acceptedTerms && <Line k="Termo" v="Aceito na mesma assinatura" />}
        {receipt.note && <Line k="Pedido" v={receipt.note} />}
      </dl>

      <button type="button" onClick={onDownload}
        className="mt-3.5 h-10 px-4 rounded-md border border-input bg-card text-sm font-medium
                   flex items-center gap-2 hover:bg-accent">
        <Download className="h-4 w-4" /> Baixar comprovante e termo (PDF)
      </button>

      <p className="text-[11px] text-muted-foreground mt-2.5">
        {approved
          ? 'A Redantex já foi avisada e a produção pode começar. Uma cópia deste comprovante foi anexada ao pedido.'
          : 'A Redantex já foi avisada. Assim que houver uma nova arte, você recebe um link novo.'}
      </p>
    </section>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">{k}</dt>
      <dd className="font-medium min-w-0">{v}</dd>
    </div>
  )
}
