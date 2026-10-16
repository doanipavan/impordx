import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, MailWarning, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/utils'

/**
 * O que não chegou, e por quê.
 *
 * Settings mostrava um número — "Failed: 2" — e nada mais. Um número sem o
 * motivo não é informação: ninguém descobre se foram dois endereços errados,
 * dois avisos descartados por uma pausa longa, ou o provedor fora do ar.
 *
 * Três coisas caem aqui, e são diferentes:
 *
 *   **Devolvido.** O endereço não existe ou recusou. O cliente está calado
 *   até alguém corrigir, e a correção é no card.
 *
 *   **Descartado.** Ficou mais de três dias na fila, quase sempre porque o
 *   freio estava puxado, e perdeu a validade. Notícia velha não se despeja na
 *   caixa de um cliente — mas também não pode sumir sem ninguém ver.
 *
 *   **Falhou.** O provedor recusou. Costuma ser conteúdo ou endereço.
 */
interface Falha {
  id: string
  card_ref: string | null
  client_name: string | null
  kind: string
  error: string | null
  bounced_at: string | null
  bounce_detail: string | null
  created_at: string
  sent_at: string | null
}

function useFailedNotices() {
  return useQuery({
    queryKey: ['outbox', 'failed'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Falha[]> => {
      const { data, error } = await supabase
        .from('email_outbox')
        .select('id, card_ref, client_name, kind, error, bounced_at, bounce_detail, created_at, sent_at')
        .or('status.eq.failed,bounced_at.not.is.null')
        .eq('preview', false)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Falha[]
    },
  })
}

const NOME: Record<string, string> = {
  'stage:Placed': 'Pedido confirmado',
  'stage:In Production': 'Em produção',
  'stage:Ready to Ship': 'Pronto na fábrica',
  'stage:Collected': 'Coletado',
  'stage:Shipped': 'Embarcado',
  'stage:Arrived': 'Chegou ao Brasil',
  'sample-approved': 'Amostra aprovada',
  'date-confirmed': 'Data confirmada',
  'date-change': 'A data mudou',
  'reminder': 'Lembrete',
}

function classificar(f: Falha): { rotulo: string; cor: string; icone: React.ReactNode; motivo: string } {
  if (f.bounced_at) {
    return {
      rotulo: 'Bounced', cor: 'text-red-700 bg-red-50 border-red-200',
      icone: <MailWarning className="h-3 w-3" />,
      motivo: f.bounce_detail || 'the address rejected it',
    }
  }
  // O descarte por idade tem texto próprio na função de envio; reconhecê-lo
  // aqui evita mostrar "falhou" para algo que foi uma decisão do sistema.
  if ((f.error ?? '').includes('perdeu a validade')) {
    return {
      rotulo: 'Dropped', cor: 'text-amber-800 bg-amber-50 border-amber-200',
      icone: <Clock className="h-3 w-3" />,
      motivo: 'waited more than three days — usually the pause was on',
    }
  }
  return {
    rotulo: 'Failed', cor: 'text-red-700 bg-red-50 border-red-200',
    icone: <AlertTriangle className="h-3 w-3" />,
    motivo: f.error || 'no reason recorded',
  }
}

export function FailedNotices() {
  const { data: falhas, isLoading } = useFailedNotices()

  // Sem nada para mostrar, o bloco não existe: uma caixa vazia dizendo "tudo
  // certo" é ruído permanente numa tela de configuração.
  if (isLoading || !falhas || falhas.length === 0) return null

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Notices that did not arrive</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            A bounced address stays silent until someone fixes it on the card. A dropped
            notice waited more than three days and lost its point — it is not sent late.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{falhas.length}</span>
      </div>

      <div className="mt-4 divide-y divide-red-100">
        {falhas.map((f) => {
          const c = classificar(f)
          return (
            <div key={f.id} className="py-2 flex items-start gap-2.5">
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border
                whitespace-nowrap shrink-0 mt-0.5 inline-flex items-center gap-1 ${c.cor}`}>
                {c.icone}{c.rotulo}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">
                  {f.client_name ?? '—'}
                  <span className="font-normal text-muted-foreground">
                    {' · '}{NOME[f.kind] ?? f.kind}
                    {f.card_ref ? ` · ${f.card_ref}` : ''}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{c.motivo}</p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDateTime(f.bounced_at ?? f.sent_at ?? f.created_at)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
