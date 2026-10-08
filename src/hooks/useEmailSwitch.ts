import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * O freio de emergência dos avisos ao cliente.
 *
 * Mora no banco, não numa variável de ambiente, por um motivo prático: o
 * Netlify só entrega variável nova num deploy novo, o que faria o freio
 * levar dois minutos e custar quinze créditos. Assim ele vira num clique, e
 * as duas funções agendadas leem a chave a cada execução. Migração 055.
 */
export interface EmailSwitch {
  enabled: boolean
  updated_at: string
  updated_by?: string | null
  by?: { full_name?: string } | null
}

export function useEmailSwitch() {
  return useQuery({
    queryKey: ['flag', 'client_emails'],
    // Alguém pode ter puxado o freio em outra aba ou de outro computador, e
    // esta tela não pode mostrar "ligado" quando está desligado.
    refetchInterval: 30_000,
    queryFn: async (): Promise<EmailSwitch | null> => {
      const { data, error } = await supabase
        .from('app_flags')
        .select('enabled, updated_at, updated_by, by:users!app_flags_updated_by_fkey(full_name)')
        .eq('key', 'client_emails')
        .maybeSingle()
      if (error) throw error
      return (data as unknown as EmailSwitch) ?? null
    },
  })
}

export function useSetEmailSwitch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase
        .from('app_flags')
        .update({ enabled })
        .eq('key', 'client_emails')
        .select('enabled, updated_at')
        .maybeSingle()
      if (error) throw error
      // Sem linha de volta a política recusou a escrita, e isso precisa
      // chegar como erro: um freio que falha em silêncio é pior que nenhum.
      if (!data) throw new Error('Not allowed to change this setting')
      return data as EmailSwitch
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flag', 'client_emails'] }),
  })
}

/** Quantos avisos estão esperando para sair, e quantos falharam. */
export function useOutboxCounts() {
  return useQuery({
    queryKey: ['outbox', 'counts'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const pending = await supabase.from('email_outbox')
        .select('id', { count: 'exact', head: true }).eq('status', 'pending')
      const failed = await supabase.from('email_outbox')
        .select('id', { count: 'exact', head: true }).eq('status', 'failed')
      const sent = await supabase.from('email_outbox')
        .select('id', { count: 'exact', head: true }).eq('status', 'sent')
      return {
        pending: pending.count ?? 0,
        failed: failed.count ?? 0,
        sent: sent.count ?? 0,
      }
    },
  })
}
