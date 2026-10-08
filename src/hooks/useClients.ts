import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * O cliente e como falar com ele.
 *
 * Mora em `clients`, não em `cards`, porque a tabela de cards é lida coluna a
 * coluna por qualquer conta autenticada cuja política deixe a linha passar — e
 * a DEQI é uma delas. A política de `clients` recusa qualquer um que não seja
 * Redantex, então estas consultas simplesmente voltam vazias para o
 * fornecedor. Migração 051.
 */
export interface Client {
  id: string
  name: string
  email?: string | null
  notes?: string | null
  updated_at?: string
}

export function useClient(clientId?: string | null) {
  return useQuery({
    queryKey: ['client', clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Client | null> => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, notes, updated_at')
        .eq('id', clientId!)
        .maybeSingle()
      // Um viewer recebe zero linhas, não um erro: a política filtra, não grita.
      if (error) throw error
      return (data as Client) ?? null
    },
  })
}

export function useSetClientEmail() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientId, email }: { clientId: string; email: string }) => {
      // String vazia limpa o campo. `undefined` seria descartado pelo
      // supabase-js e deixaria o endereço antigo no lugar, em silêncio.
      const trimmed = email.trim()
      const { data, error } = await supabase
        .from('clients')
        .update({ email: trimmed || null })
        .eq('id', clientId)
        .select('id, name, email, notes, updated_at')
        .maybeSingle()

      if (error) throw error
      // Sem linha de volta significa que a política recusou a escrita — e isso
      // precisa chegar como erro, não como sucesso silencioso.
      if (!data) throw new Error('Not allowed to update this client')
      return data as Client
    },
    onSuccess: (client) => {
      queryClient.setQueryData(['client', client.id], client)
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}
