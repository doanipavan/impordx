import { useParams } from 'react-router-dom'
import { Loader2, LinkIcon, Clock, Ban } from 'lucide-react'
import { useApprovalView, publicFileUrl } from '../hooks/useApproval'
import { ClientApproval, ApprovalPiece, SignedReceipt } from './ClientApproval'

/**
 * A porta do link do cliente: carrega pelo token e decide o que mostrar.
 *
 * Fora do ProtectedRoute, de propósito — quem abre não tem conta. Tudo o que
 * a página sabe vem de `approval_view`, que roda como dono e entrega apenas a
 * arte e a identificação da peça.
 */
export function ApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, error } = useApprovalView(token)

  if (isLoading) {
    return (
      <Shell>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Shell>
    )
  }

  if (error || !data || data.state === 'unknown') {
    return (
      <Shell>
        <Message icon={<LinkIcon className="h-8 w-8" />} title="Link não encontrado"
          body="Confira se o endereço foi copiado inteiro. Se continuar assim, peça um link novo à Redantex." />
      </Shell>
    )
  }

  if (data.state === 'expired') {
    return (
      <Shell>
        <Message icon={<Clock className="h-8 w-8" />} title="Este link expirou"
          body="Por segurança, o link vale por tempo limitado. Peça um novo à Redantex e ele chega na hora." />
      </Shell>
    )
  }

  if (data.state === 'revoked') {
    return (
      <Shell>
        <Message icon={<Ban className="h-8 w-8" />} title="Este link foi cancelado"
          body="A Redantex cancelou este pedido de aprovação — provavelmente porque há uma arte nova a caminho." />
      </Shell>
    )
  }

  const expires = data.expires_at
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' })
        .format(new Date(data.expires_at))
    : ''

  const art = (data.files ?? []).map(f => ({ url: publicFileUrl(f.path), caption: f.filename, type: f.type }))

  const piece: ApprovalPiece = {
    reference: data.reference ?? '',
    title: data.title ?? '',
    client: data.client ?? '',
    art,
    specs: data.specs ?? undefined,
    notes: data.notes ?? undefined,
    expiresOn: expires,
    sentBy: data.sent_by ? `${data.sent_by}, da Redantex,` : 'A Redantex',
    terms: {
      order: data.reference ?? '',
      artVersion: art.map(a => a.caption).filter(Boolean).join(' · ') || '—',
      // Enquanto não assinou, o campo mostra o dia de hoje; ao assinar, o banco
      // grava o instante real e é ele que vai no comprovante.
      date: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    },
  }

  const signed: SignedReceipt | undefined = data.signature
    ? {
        decision: data.signature.decision,
        name: data.signature.name,
        email: data.signature.email,
        at: new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }).format(new Date(data.signature.at)) + ' (horário de Brasília)',
        note: data.signature.note ?? undefined,
        acceptedTerms: data.signature.accepted_terms,
      }
    : undefined

  return <ClientApproval piece={piece} token={token} initial={signed} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf9f8] flex flex-col items-center justify-center p-6 gap-4">
      <img src="/logo.webp" alt="Redantex" className="h-8 object-contain" />
      {children}
    </div>
  )
}

function Message({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="text-center max-w-sm">
      <div className="text-muted-foreground flex justify-center mb-3">{icon}</div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1.5">{body}</p>
    </div>
  )
}
