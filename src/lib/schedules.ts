/**
 * As rotinas que rodam sozinhas.
 *
 * A cadência aqui é uma cópia: o horário de verdade é uma linha de cron
 * dentro de cada função, e mudá-lo exige publicar. O que não dá para
 * inventar é a última execução — as próprias funções a registram (migração
 * 061), e é esse o ponto: o silêncio de uma rotina que não tinha nada a fazer
 * é idêntico ao silêncio de uma rotina que parou.
 *
 * `job` tem que ser igual ao nome que a função escreve. Se divergir, a linha
 * fica para sempre em "ainda não registrou" e a tela mente nos dois sentidos:
 * parece morta quando está viva, e parece igual quando morrer de verdade.
 * `scripts/check-job-runs.ts` compara os três nomes com o banco e com o
 * código das funções.
 */
export interface Routine {
  job: string
  label: string
  cadence: string
  detail: string
  /** Horas sem rodar a partir das quais a tela acende o alerta. */
  overdueHours: number
}

export const ROUTINES: Routine[] = [
  {
    job: 'daily-summary',
    label: 'Daily report',
    cadence: '08:00, every day',
    detail: 'Arrivals month by month, to the list above',
    // Uma rotina diária só está atrasada depois de um ciclo inteiro perdido.
    overdueHours: 26,
  },
  {
    job: 'queue-reminders',
    label: 'Queue the reminders',
    cadence: '09:00, every day',
    detail: 'Finds the orders a client has not heard about in fifteen days',
    overdueHours: 26,
  },
  {
    job: 'send-queued-emails',
    label: 'Empty the queue',
    cadence: 'every 15 minutes',
    detail: 'Sends what is waiting, to the client with the salesperson in copy',
    overdueHours: 2,
  },
]

/** A linha semeada pela migração, antes da primeira execução de verdade. */
export const NUNCA_REGISTROU = 'ainda não registrou'

export function routineState(
  run: { last_run_at: string; last_ok: boolean; note?: string | null } | undefined,
  overdueHours: number,
  now = Date.now(),
): 'novo' | 'ok' | 'atrasado' | 'falhou' {
  if (!run || run.note === NUNCA_REGISTROU) return 'novo'
  if (!run.last_ok) return 'falhou'
  const horas = (now - new Date(run.last_run_at).getTime()) / 3_600_000
  return horas > overdueHours ? 'atrasado' : 'ok'
}
