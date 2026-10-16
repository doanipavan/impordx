import { useState } from 'react'
import { Mail, Check, X, Pencil, AlertCircle, ShieldCheck, History, MailWarning } from 'lucide-react'
import { useClient, useSetClientEmail } from '../../hooks/useClients'
import { useClientCatchup, useClientSilentOrders } from '../../hooks/useClientNotices'
import { PreviewButton } from './NoticePreview'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Card } from '../../types'

// Suficiente para pegar o dedo trocado — arroba de menos, espaço no meio,
// domínio sem ponto. Validação de email além disso é teatro: o único teste
// que vale é a mensagem chegar.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * Onde o endereço do cliente é digitado.
 *
 * Um endereço por cliente, não por card: o mesmo cliente volta em vários
 * pedidos, e endereço redigitado é endereço errado. Fica escondido do
 * fornecedor na tela e, o que importa mais, fora do alcance dele no banco —
 * a tabela `clients` tem política própria (051).
 */
export function ClientContact({ card }: { card: Card }) {
  const { user } = useAuth()
  const { data: client, isLoading } = useClient(card.client_id)
  const setEmail = useSetClientEmail()
  const catchup = useClientCatchup()
  const { data: calados = 0 } = useClientSilentOrders(card.client_id)
  const toast = useToast()

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  // O fornecedor não vê este bloco. A política já o impediria de ler a linha;
  // isto evita que ele veja um campo vazio e pergunte o que é.
  if (user?.role === 'viewer') return null
  if (!card.client_name) return null

  function startEditing() {
    setValue(client?.email ?? '')
    setEditing(true)
  }

  async function handleSave() {
    if (!client) return
    const trimmed = value.trim()
    if (trimmed && !looksLikeEmail(trimmed)) {
      toast('That does not look like an email address', 'error')
      return
    }
    try {
      await setEmail.mutateAsync({ clientId: client.id, email: trimmed })
      setEditing(false)
      toast(trimmed ? 'Client email saved' : 'Client email cleared', 'success')
    } catch (err) {
      console.error('Failed to save client email:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Failed to save: ${detail}` : 'Failed to save client email', 'error')
    }
  }

  const email = client?.email?.trim()
  const missing = !isLoading && !email
  const devolveu = !!client?.bounced_at

  return (
    <div className={devolveu
      ? 'rounded-lg border border-red-300 bg-red-50/60 p-4'
      : missing
        ? 'rounded-lg border border-amber-300 bg-amber-50/60 p-4'
        : 'rounded-lg border border-border bg-card p-4'}>
      <div className="flex items-center gap-2 mb-3">
        <Mail className={missing ? 'h-4 w-4 text-amber-600' : 'h-4 w-4 text-primary'} />
        <p className="text-sm font-semibold">Client contact</p>
        {!editing && client && (
          <div className="ml-auto flex items-center gap-1">
            <PreviewButton card={card} clientName={client.name} />
          </div>
        )}
        {!editing && client && (
          <button onClick={startEditing}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-accent">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Client</p>
        <p className="text-sm font-medium">{client?.name ?? card.client_name}</p>
      </div>

      <div className="mt-3 space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Email</p>

        {editing ? (
          <div className="flex gap-2 items-start">
            <Input className="h-8 text-sm" type="email" value={value} autoFocus
              placeholder="nome@empresa.com.br"
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }} />
            <Button size="sm" onClick={handleSave} loading={setEmail.isPending}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : email ? (
          <>
            <p className={`text-sm font-medium ${devolveu ? 'line-through text-muted-foreground' : ''}`}>
              {email}
            </p>
            {/* Devolução permanente cala o cliente até alguém corrigir. Dizer
                isso aqui, onde o endereço é digitado, é a única forma de a
                correção acontecer — na fila ninguém olha. */}
            {devolveu && (
              <p className="text-[11.5px] text-red-800 bg-red-50 border border-red-200 rounded-lg
                px-2.5 py-2 mt-1.5 flex items-start gap-1.5">
                <MailWarning className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  This address bounced and nothing is being sent to it.
                  {client?.bounce_detail ? ` ${client.bounce_detail}` : ''}
                  {' '}Fix it above and saving will try again.
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-amber-700 font-medium flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            No email yet — this client cannot be notified
          </p>
        )}
      </div>

      {/* Cadastrar o endereço não alcança o passado: o gatilho de etapa só
          dispara quando o card se move. Sem esta oferta, um cliente
          cadastrado hoje nunca receberia "pedido confirmado" nem "em
          produção", e o primeiro email que a Redantex lhe mandaria poderia
          ser "sua mercadoria chegou ao Brasil". */}
      {email && !devolveu && calados > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[11.5px] text-amber-900 leading-relaxed flex items-start gap-1.5">
            <History className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {calados === 1
              ? 'This client has 1 order in progress they have never heard about.'
              : `This client has ${calados} orders in progress they have never heard about.`}
          </p>
          <Button size="sm" variant="outline" className="mt-2" loading={catchup.isPending}
            onClick={async () => {
              try {
                const n = await catchup.mutateAsync(client!.id)
                toast(n === 0
                  ? 'Nothing to send — they are already up to date'
                  : `Queued ${n} “where your order is” notice${n === 1 ? '' : 's'}`, 'success')
              } catch (err) {
                toast((err as Error).message, 'error')
              }
            }}>
            Send them where each order stands
          </Button>
        </div>
      )}

      {/* O motivo de existir uma tabela separada, dito onde a pessoa está
          digitando: é o único lugar onde alguém se pergunta quem mais lê isto. */}
      <p className="text-[11px] text-muted-foreground mt-3 flex items-start gap-1.5">
        <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
        One address per client, reused across every card. Redantex only — the supplier cannot read it.
      </p>
    </div>
  )
}
