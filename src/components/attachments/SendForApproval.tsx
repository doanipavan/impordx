import { useState } from 'react'
import { Send, Copy, Check, ExternalLink, Clock } from 'lucide-react'
import { Attachment, Card } from '../../types'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../ui/dialog'
import { useToast } from '../ui/toast'
import { useCreateApprovalLink } from '../../hooks/useApproval'
import { errorText } from '../../lib/utils'

/**
 * "Send to client": o botão que transforma a arte que o fornecedor acabou de
 * subir num link de aprovação.
 *
 * O que vai no link é escolhido aqui, arquivo a arquivo, e nada mais atravessa:
 * nem as referências, nem a cotação, nem os outros arquivos do card. A ficha da
 * peça é opcional e nasce desmarcada — o pedido foi "apenas a arte".
 *
 * Nada aqui fala com o banco ainda: a tela existe para ser avaliada antes da
 * tabela de tokens existir.
 */

const DAYS = 30

export function SendForApproval({ card, attachments, initialId, onClose }: {
  card: Card
  attachments: Attachment[]
  /** O arquivo em que se clicou. Já vem marcado. */
  initialId?: string
  onClose: () => void
}) {
  const toast = useToast()
  // Só imagem e PDF: é o que o cliente consegue conferir no celular.
  const sendable = attachments.filter(a =>
    a.file_type.startsWith('image/') || a.file_type === 'application/pdf')

  const [picked, setPicked] = useState<string[]>(initialId ? [initialId] : [])
  const [withSpecs, setWithSpecs] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const createLink = useCreateApprovalLink()

  const toggle = (id: string) =>
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const [expiresOn, setExpiresOn] = useState(
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(Date.now() + DAYS * 86_400_000)))

  async function generate() {
    try {
      // O token volta uma vez só: não fica em claro no banco e não há como
      // pedi-lo de novo. Some da tela quando a caixa fecha.
      const made = await createLink.mutateAsync({
        cardId: card.id, attachmentIds: picked, includeSpecs: withSpecs,
      })
      setLink(`${window.location.origin}/aprovar/${made.token}`)
      setExpiresOn(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        .format(new Date(made.expires_at)))
    } catch (err) {
      console.error('Failed to create the approval link:', err)
      toast(errorText(err) ?? 'Could not create the link', 'error')
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { toast('Could not copy — select the link and copy by hand', 'error') }
  }

  return (
    <Dialog open onClose={onClose} size="md" title="Send to client">
      <DialogHeader onClose={onClose}>Send to client</DialogHeader>

      {link ? (
        <>
          <DialogBody className="space-y-3">
            <p className="text-sm">
              Link ready for <strong>{card.client_name || card.title}</strong>. Send it by WhatsApp
              or email — anyone holding it can sign, so send it to the client only. It is shown
              once: copy it now.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <span className="text-xs font-mono truncate flex-1">{link}</span>
              <button onClick={copy}
                className="h-8 px-2.5 rounded flex items-center gap-1.5 text-xs font-medium
                           border border-input bg-card hover:bg-accent shrink-0">
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Expires {expiresOn} · {picked.length} {picked.length === 1 ? 'file' : 'files'}
              {withSpecs ? ' · with the spec sheet' : ''}
            </p>
            <a href={link} target="_blank" rel="noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Open what the client will see
            </a>
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogBody className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pick the artwork the client should sign off. Nothing else from this card travels with
              the link — no reference files, no quotation, no prices.
            </p>

            <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
              {sendable.map(a => {
                const on = picked.includes(a.id)
                return (
                  <label key={a.id}
                    className={cn('flex items-center gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer transition-colors',
                      on ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-accent/50')}>
                    <input type="checkbox" checked={on} onChange={() => toggle(a.id)}
                      className="h-4 w-4 rounded border-input accent-primary shrink-0" />
                    <span className="text-sm truncate flex-1 min-w-0">{a.filename}</span>
                    <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0',
                      a.kind === 'sample' ? 'text-blue-700 bg-blue-100'
                        : a.kind === 'pi' ? 'text-purple-700 bg-purple-100'
                        : a.kind === 'quotation' ? 'text-emerald-700 bg-emerald-100'
                        : 'text-slate-700 bg-slate-200')}>
                      {a.kind ?? 'no category'}
                    </span>
                  </label>
                )
              })}
            </div>

            <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={withSpecs} onChange={() => setWithSpecs(v => !v)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0" />
              <span>
                Also show the spec sheet
                <span className="block text-xs text-muted-foreground">
                  Collection, quantity, materials, logo and sizes. Off by default — the client signs the art.
                </span>
              </span>
            </label>

            <p className="text-xs text-muted-foreground border-t border-border/70 pt-2.5">
              The link works for {DAYS} days, for this artwork only, and stops working the moment it
              is signed. Whoever signs is recorded with their name, email, time and IP.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={generate} loading={createLink.isPending}
              disabled={picked.length === 0} className="gap-1.5">
              <Send className="h-4 w-4" /> Generate link
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  )
}
