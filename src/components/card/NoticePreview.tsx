import { useMemo, useState } from 'react'
import { Eye, Send, X } from 'lucide-react'
import { clientEmail, cardToEmailInput } from '../../../netlify/lib/clientEmail.mjs'
import { usePreviewNotice } from '../../hooks/useClientNotices'
import { useCardItems } from '../../hooks/useCardItems'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { Card } from '../../types'

/**
 * O email que o cliente receberia, visto antes de ele receber.
 *
 * Monta com `clientEmail`, o mesmo construtor que as funções do Netlify usam
 * para enviar de verdade. Uma prévia montada por outro código seria uma
 * segunda versão do email, parecida, divergindo no dia em que alguém mexesse
 * num dos dois — e o lugar onde a divergência apareceria é a caixa do cliente.
 *
 * Até existir isto, conferir um aviso significava mover o card de um cliente
 * que tem endereço, ou seja, escrever para ele. Com 46 clientes ainda por
 * cadastrar, era descobrir os erros no destinatário.
 */

const AVISOS: { kind: string; label: string }[] = [
  { kind: 'stage:Placed', label: 'Pedido confirmado' },
  { kind: 'stage:In Production', label: 'Entrou em produção' },
  { kind: 'stage:Ready to Ship', label: 'Pronto na fábrica' },
  { kind: 'stage:Collected', label: 'Coletado' },
  { kind: 'stage:Shipped', label: 'Embarcado' },
  { kind: 'stage:Arrived', label: 'Chegou ao Brasil' },
  { kind: 'reminder', label: 'Lembrete de quinze dias' },
  { kind: 'date-change', label: 'A data mudou' },
  { kind: 'date-confirmed', label: 'A fábrica cravou a data' },
  { kind: 'sample-approved', label: 'Amostra aprovada' },
]

/** O dia de hoje em São Paulo, como a função de envio o calcula. */
function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function NoticePreview({ card, clientName, onClose }: {
  card: Card
  clientName: string
  onClose: () => void
}) {
  const { data: items } = useCardItems(card.id)
  const enviar = usePreviewNotice()
  const toast = useToast()

  // Começa na etapa em que o card está: é o aviso que o cliente receberia se
  // alguém o movesse agora, que é a pergunta de quem abre esta tela.
  const atual = AVISOS.find((a) => a.kind === `stage:${card.status}`)?.kind ?? 'reminder'
  const [kind, setKind] = useState(atual)

  const mail = useMemo(() => {
    const stage = kind.startsWith('stage:') ? kind.slice('stage:'.length) : kind
    return clientEmail(cardToEmailInput(
      { ...card, card_items: items ?? [] } as unknown as Record<string, unknown>,
      { stage, client: clientName, today: hoje() },
    ))
  }, [card, items, kind, clientName])

  async function mandar() {
    try {
      const para = await enviar.mutateAsync({ cardId: card.id, kind })
      toast(`Preview queued to ${para} — it goes out within 15 minutes`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-card rounded-xl border border-border w-full max-w-[680px] my-6">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <p className="text-sm font-semibold">What the client would receive</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {clientName} · {card.ref_number}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Notice
            </label>
            <Select className="h-8 text-xs mt-1" value={kind}
              onChange={(e) => setKind(e.target.value)}>
              {AVISOS.map((a) => (
                <option key={a.kind} value={a.kind}>{a.label}</option>
              ))}
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={mandar} loading={enviar.isPending}>
            <Send className="h-3.5 w-3.5 mr-1" /> Send it to me
          </Button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</p>
          <p className="text-sm mt-0.5">{mail.subject}</p>
        </div>

        {/* O email dentro de um iframe: ele traz estilos próprios, e fora de
            um quadro deles eles vazariam para o hub — ou o hub para eles, que
            é pior, porque a prévia deixaria de ser fiel. */}
        <iframe title="preview" srcDoc={mail.html}
          className="w-full h-[520px] border-0 rounded-b-xl bg-white" />
      </div>
    </div>
  )
}

export function PreviewButton({ card, clientName }: { card: Card; clientName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1
          px-2 py-1 rounded hover:bg-accent">
        <Eye className="h-3 w-3" /> Preview
      </button>
      {open && <NoticePreview card={card} clientName={clientName} onClose={() => setOpen(false)} />}
    </>
  )
}
