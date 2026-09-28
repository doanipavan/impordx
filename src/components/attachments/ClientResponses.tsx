import { CheckCircle2, MessageSquareWarning, Clock } from 'lucide-react'
import { useClientResponses } from '../../hooks/useApproval'
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
        {latest.accepted_terms && ' · aceitou o termo'}
      </p>

      {older.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {older.length} {older.length === 1 ? 'resposta anterior' : 'respostas anteriores'}
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {older.map(r => (
              <li key={r.id} className="flex gap-2 text-muted-foreground">
                <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  <b className={r.decision === 'changes' ? 'text-amber-800' : 'text-green-800'}>
                    {r.decision === 'changes' ? 'Ajuste' : 'Aprovado'}
                  </b>
                  {' · '}{formatDateTime(r.signed_at)}{' · '}{r.signer_name}
                  {r.note && <span className="block text-foreground/80">{r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
