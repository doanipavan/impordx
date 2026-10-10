import { Mail, AlertCircle, Check, Clock, Ban } from 'lucide-react'
import { useEmailSwitch, useSetEmailSwitch, useOutboxCounts } from '../hooks/useEmailSwitch'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/toast'
import { Button } from '../components/ui/button'
import { Salespeople } from '../components/settings/Salespeople'
import { Recipients } from '../components/settings/Recipients'
import { Schedules } from '../components/settings/Schedules'
import { formatDateTime } from '../lib/utils'

/**
 * Por ora esta página tem uma coisa só, e é a que não podia faltar: o freio
 * dos avisos automáticos ao cliente.
 *
 * Mensagem que sai sozinha precisa de um jeito de parar que não dependa de
 * deploy, de terminal, nem de mim. A chave mora no banco e as duas funções
 * agendadas a leem a cada execução — o efeito é imediato na próxima rodada,
 * no máximo quinze minutos.
 */
export function SettingsPage() {
  const { user } = useAuth()
  const { data: flag, isLoading } = useEmailSwitch()
  const { data: counts } = useOutboxCounts()
  const setSwitch = useSetEmailSwitch()
  const toast = useToast()

  if (user?.role === 'viewer') {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Nothing here for you.</p>
      </div>
    )
  }

  const on = flag?.enabled !== false

  async function toggle() {
    try {
      const next = !on
      await setSwitch.mutateAsync(next)
      toast(next ? 'Client emails resumed' : 'Client emails paused', next ? 'success' : 'error')
    } catch (err) {
      console.error('Failed to flip the email switch:', err)
      toast('Could not change the setting', 'error')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Workspace configuration</p>
        </div>

        <div className={on
          ? 'rounded-lg border border-border bg-card p-5'
          : 'rounded-lg border-2 border-red-300 bg-red-50/60 p-5'}>
          <div className="flex items-start gap-3">
            <Mail className={on ? 'h-5 w-5 text-primary mt-0.5' : 'h-5 w-5 text-red-600 mt-0.5'} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Automatic client emails</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Stage notices, the fifteen-day reminder and the delivery-date warning.
                Sent to the client, with the salesperson in copy.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <span className={on
                  ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full'
                  : 'inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-100 border border-red-200 px-2.5 py-1 rounded-full'}>
                  {on ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                  {isLoading ? '…' : on ? 'Sending' : 'Paused'}
                </span>

                <Button size="sm" variant={on ? 'destructive' : 'default'}
                  onClick={toggle} loading={setSwitch.isPending}>
                  {on ? 'Pause all client emails' : 'Resume sending'}
                </Button>
              </div>

              {flag?.updated_at && (
                <p className="text-[11px] text-muted-foreground mt-3">
                  Last changed {formatDateTime(flag.updated_at)}
                  {flag.by?.full_name ? ` by ${flag.by.full_name}` : ''}
                </p>
              )}

              {!on && (
                <p className="text-xs text-red-800 mt-3 flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Nothing goes out while this is paused. Notices still queue up, and anything
                  older than three days is dropped rather than sent late.
                </p>
              )}
            </div>
          </div>

          {/* O que está na fila agora. Sem isto, "pausado" é uma palavra sem
              consequência visível — e é justamente quando alguém pausa que
              quer saber quanto estava prestes a sair. */}
          {counts && (
            <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-3">
              <Count icon={<Clock className="h-3 w-3" />} label="Waiting" value={counts.pending}
                tone={counts.pending > 0 ? 'amber' : 'plain'} />
              <Count icon={<Check className="h-3 w-3" />} label="Sent" value={counts.sent} tone="plain" />
              <Count icon={<AlertCircle className="h-3 w-3" />} label="Failed" value={counts.failed}
                tone={counts.failed > 0 ? 'red' : 'plain'} />
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The switch takes effect on the next run, at most fifteen minutes away. It does not
          touch the daily pipeline summary, which goes to Redantex only.
        </p>

        <Recipients />

        <Schedules />

        <Salespeople />
      </div>
    </div>
  )
}

function Count({ icon, label, value, tone }: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'plain' | 'amber' | 'red'
}) {
  const colour = tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-foreground'
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}{label}
      </p>
      <p className={`text-lg font-semibold mt-0.5 ${colour}`}>{value}</p>
    </div>
  )
}
