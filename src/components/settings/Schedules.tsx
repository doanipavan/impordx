import { Clock, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { useJobRuns } from '../../hooks/useJobRuns'
import { formatDateTime, cn } from '../../lib/utils'
import { ROUTINES, routineState } from '../../lib/schedules'

export function Schedules() {
  const { data: runs, isLoading } = useJobRuns()
  const by = new Map((runs ?? []).map((r) => [r.job, r]))

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Clock className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Scheduled routines</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            What runs on its own, and when it last did. Times are São Paulo. Changing a
            schedule means changing the code; who receives and whether it sends at all is
            on this page.
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      )}

      <div className="mt-4 divide-y divide-border">
        {ROUTINES.map((r) => {
          // Nunca registrou é diferente de atrasado: a tabela nasceu depois
          // das rotinas, e a primeira execução de cada uma corrige a linha.
          const run = by.get(r.job)
          const estado = routineState(run, r.overdueHours)
          const novo = estado === 'novo'
          const atrasado = estado === 'atrasado'
          const falhou = estado === 'falhou'

          return (
            <div key={r.job} className="py-2.5 flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {falhou || atrasado
                  ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  : novo
                    ? <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    : <Check className="h-3.5 w-3.5 text-green-600" />}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">
                  {r.label}
                  <span className="font-normal text-muted-foreground"> · {r.cadence}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{r.detail}</p>
                {run && !novo && (
                  <p className={cn('text-[11px] mt-1',
                    falhou || atrasado ? 'text-amber-700' : 'text-muted-foreground')}>
                    Last ran {formatDateTime(run.last_run_at)}
                    {run.note ? ` — ${run.note}` : ''}
                    {atrasado ? ' · later than expected' : ''}
                  </p>
                )}
                {novo && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Has not reported yet — it will on its next run.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
