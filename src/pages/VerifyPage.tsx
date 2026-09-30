import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck, ShieldX, Search, Loader2 } from 'lucide-react'
import { useVerifySignature } from '../hooks/useApproval'
import { usePortuguesePage } from '../hooks/usePortuguesePage'
import { cn } from '../lib/utils'

/**
 * A conferência pública de um comprovante.
 *
 * É o que transforma o registro em prova utilizável: qualquer pessoa com o
 * papel na mão — o cliente, um advogado, um contador — digita o código e o
 * hub confirma que aquela assinatura existe, quando foi feita e sobre qual
 * conteúdo. Sem o código, esta página não mostra nada; com ele, mostra o
 * bastante para conferir e nada que identifique o pedido: nem arte, nem
 * preço, nem e-mail inteiro.
 */
export function VerifyPage() {
  usePortuguesePage()
  const { code: fromUrl } = useParams<{ code?: string }>()
  const [typed, setTyped] = useState(fromUrl ?? '')
  const [asked, setAsked] = useState(fromUrl ?? '')
  const { data, isFetching } = useVerifySignature(asked)

  const dateTime = (iso?: string | null) => iso
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso)) + ' (Brasília)'
    : '—'

  return (
    <div className="min-h-screen bg-[#faf9f8]">
      <header className="bg-card border-b border-border">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center gap-3">
          <img src="/logo.webp" alt="Redantex" className="h-7 object-contain" />
          <p className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Conferência de comprovante
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Confira uma aprovação</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Digite o código de conferência impresso no comprovante em PDF.
          </p>
        </div>

        <form className="flex gap-2"
          onSubmit={e => { e.preventDefault(); setAsked(typed.trim().toUpperCase()) }}>
          <input value={typed} onChange={e => setTyped(e.target.value.toUpperCase())}
            placeholder="Ex.: 4F2A9C1B7E"
            className="flex-1 h-11 rounded-md border border-input bg-background px-3 font-mono tracking-widest
                       focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          <button type="submit" disabled={typed.trim().length < 6}
            className={cn('h-11 px-5 rounded-md font-semibold text-sm flex items-center gap-2',
              typed.trim().length >= 6 ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed')}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Conferir
          </button>
        </form>

        {asked && !isFetching && data && !data.found && (
          <section className="rounded-lg border-2 border-red-300 bg-red-50 p-4 flex items-start gap-3">
            <ShieldX className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Código não encontrado</p>
              <p className="text-sm text-red-800 mt-0.5">
                Confira se digitou exatamente como está no comprovante. Nenhuma aprovação com este
                código foi registrada.
              </p>
            </div>
          </section>
        )}

        {data?.found && (
          <section className="rounded-lg border-2 border-green-500 bg-green-50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-700 shrink-0" />
              <p className="font-semibold text-green-900">
                {data.decision === 'approved' ? 'Aprovação registrada' : 'Pedido de ajuste registrado'}
              </p>
            </div>

            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Pedido" v={data.reference ?? '—'} />
              <Row k="Assinado por" v={`${data.signer_name} · ${data.signer_email}`} />
              {data.signer_document && <Row k="CPF / CNPJ" v={data.signer_document} />}
              <Row k="Data e hora" v={dateTime(data.signed_at)} />
              {data.accepted_terms && <Row k="Termo de Aprovação" v="Aceito na mesma assinatura" />}
              <Row k="Endereço IP" v={data.ip ?? 'não registrado'} />
            </dl>

            <div className="mt-3 pt-3 border-t border-green-300 space-y-2 text-xs text-green-900/90">
              <p className="font-semibold uppercase tracking-wide text-[10px]">Trilha do link</p>
              <p>Enviado ao cliente em {dateTime(data.sent_at)}</p>
              <p>
                Aberto pela primeira vez em {dateTime(data.first_opened_at)}
                {typeof data.open_count === 'number' && data.open_count > 0 && ` · ${data.open_count} aberturas`}
              </p>
              <p className="break-all">
                <span className="font-semibold">Resumo do conteúdo (SHA-256):</span>{' '}
                <span className="font-mono text-[10px]">{data.snapshot_hash}</span>
              </p>
            </div>
          </section>
        )}

        <p className="text-[11px] text-muted-foreground">
          A conferência confirma que existe um registro com este código e mostra sobre o que ele foi
          feito. O conteúdo aprovado — arte, pedido e valores — não é exibido aqui.
        </p>
      </main>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-xs text-muted-foreground w-32 shrink-0 pt-0.5">{k}</dt>
      <dd className="font-medium min-w-0 break-words">{v}</dd>
    </div>
  )
}
