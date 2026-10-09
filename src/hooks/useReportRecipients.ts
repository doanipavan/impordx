import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Quem recebe o panorama diário.
 *
 * Mora no banco, não numa variável de ambiente do Netlify, pelo mesmo motivo
 * do freio da 055: variável nova só vale no deploy seguinte, então incluir
 * alguém custava quinze créditos e acesso ao painel do Netlify. Migração 059.
 */
export interface Recipient {
  id: string
  name?: string | null
  email: string
  active: boolean
}

const CAMPOS = 'id, name, email, active'

export function useReportRecipients() {
  return useQuery({
    queryKey: ['report-recipients'],
    queryFn: async (): Promise<Recipient[]> => {
      const { data, error } = await supabase
        .from('report_recipients')
        .select(CAMPOS)
        .order('name', { nullsFirst: false })
      if (error) throw error
      return (data ?? []) as Recipient[]
    },
  })
}

function traduz(error: { code?: string; message: string }): Error {
  return new Error(error.code === '23505'
    ? 'That address is already on the list'
    : error.message)
}

export function useAddRecipient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, email }: { name?: string; email: string }) => {
      const { data, error } = await supabase
        .from('report_recipients')
        .insert({ name: name?.trim() || null, email: email.trim() })
        .select(CAMPOS)
        .maybeSingle()
      if (error) throw traduz(error)
      if (!data) throw new Error('Not allowed to add a recipient')
      return data as Recipient
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-recipients'] }),
  })
}

export function useUpdateRecipient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Recipient> & { id: string }) => {
      const body: Record<string, unknown> = {}
      if (patch.name !== undefined) body.name = patch.name?.trim() || null
      if (patch.email !== undefined) body.email = patch.email.trim()
      if (patch.active !== undefined) body.active = patch.active

      const { data, error } = await supabase
        .from('report_recipients')
        .update(body)
        .eq('id', id)
        .select(CAMPOS)
        .maybeSingle()
      if (error) throw traduz(error)
      if (!data) throw new Error('Not allowed to update this recipient')
      return data as Recipient
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-recipients'] }),
  })
}
