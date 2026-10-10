import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Quando cada rotina agendada rodou pela última vez.
 *
 * Existe para separar duas coisas que o silêncio confunde: a rotina não ter
 * rodado, e a rotina ter rodado e não ter o que fazer — que é o caso normal na
 * maioria dos dias. Migração 061.
 */
export interface JobRun {
  job: string
  last_run_at: string
  last_ok: boolean
  note?: string | null
}

export function useJobRuns() {
  return useQuery({
    queryKey: ['job-runs'],
    // A rotina mais frequente roda de quinze em quinze minutos; um minuto de
    // atraso na tela não muda decisão nenhuma.
    refetchInterval: 60_000,
    queryFn: async (): Promise<JobRun[]> => {
      const { data, error } = await supabase
        .from('job_runs')
        .select('job, last_run_at, last_ok, note')
      if (error) throw error
      return (data ?? []) as JobRun[]
    },
  })
}
