import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Salesperson } from '../types'

/**
 * Quem vende na Redantex — os vinte e cinco, não as cinco contas do hub.
 *
 * Mora em `salespeople`, com política que só aceita Redantex, pelo mesmo
 * motivo de `clients`: é lista comercial com endereços, e `cards` é lida
 * coluna a coluna por qualquer conta autenticada, a DEQI inclusive. Para o
 * fornecedor estas consultas voltam vazias. Migração 056.
 */
const LISTA = 'id, name, email, user_id, active'

export function useSalespeople() {
  return useQuery({
    queryKey: ['salespeople'],
    queryFn: async (): Promise<Salesperson[]> => {
      const { data, error } = await supabase
        .from('salespeople')
        .select(LISTA)
        .order('name')
      if (error) throw error
      return (data ?? []) as Salesperson[]
    },
  })
}

/** Só os que ainda vendem — é esta a lista que vai no seletor do card. */
export function useActiveSalespeople() {
  const query = useSalespeople()
  return { ...query, data: query.data?.filter((s) => s.active) }
}

export function useCreateSalesperson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, email }: { name: string; email?: string }) => {
      const { data, error } = await supabase
        .from('salespeople')
        .insert({ name: name.trim(), email: email?.trim() || null })
        .select(LISTA)
        .maybeSingle()
      // O índice único por nome recusa a segunda grafia da mesma pessoa, e é
      // isso que impede a quarta Julia. A mensagem do Postgres é ilegível, a
      // daqui não é.
      if (error) {
        throw new Error(error.code === '23505'
          ? 'There is already a salesperson with that name'
          : error.message)
      }
      if (!data) throw new Error('Not allowed to add a salesperson')
      return data as Salesperson
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salespeople'] }),
  })
}

export function useUpdateSalesperson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Salesperson> & { id: string }) => {
      // String vazia limpa o endereço; `undefined` seria descartado pelo
      // supabase-js e deixaria o antigo no lugar, em silêncio.
      const body: Record<string, unknown> = {}
      if (patch.name !== undefined) body.name = patch.name.trim()
      if (patch.email !== undefined) body.email = patch.email?.trim() || null
      if (patch.active !== undefined) body.active = patch.active

      const { data, error } = await supabase
        .from('salespeople')
        .update(body)
        .eq('id', id)
        .select(LISTA)
        .maybeSingle()
      if (error) {
        throw new Error(error.code === '23505'
          ? 'There is already a salesperson with that name'
          : error.message)
      }
      if (!data) throw new Error('Not allowed to update this salesperson')
      return data as Salesperson
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salespeople'] })
      // Renomear reescreve o nome nos cards, por gatilho (058) — o que está
      // na tela precisa ser relido, senão continua mostrando a grafia velha.
      queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
  })
}

/**
 * O link pessoal de cada vendedor.
 *
 * O banco guarda só o hash do token, então o endereço completo existe uma
 * única vez: no retorno de `sales_link_create`. Quem fechar a tela sem copiar
 * precisa gerar outro — e gerar outro revoga o anterior, que é exatamente o
 * que se quer quando um link foi parar no lugar errado. Migração 062.
 */
export interface SalespersonLink {
  salesperson_id: string
  created_at: string
  first_opened_at?: string | null
  last_opened_at?: string | null
  open_count: number
}

export function useSalespersonLinks() {
  return useQuery({
    queryKey: ['salesperson-links'],
    queryFn: async (): Promise<SalespersonLink[]> => {
      const { data, error } = await supabase
        .from('salesperson_links')
        .select('salesperson_id, created_at, first_opened_at, last_opened_at, open_count')
        .is('revoked_at', null)
      if (error) throw error
      return (data ?? []) as SalespersonLink[]
    },
  })
}

export function useCreateSalespersonLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (salespersonId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('sales_link_create', {
        p_salesperson: salespersonId,
      })
      if (error) throw error
      if (!data) throw new Error('Could not create the link')
      return `${window.location.origin}/meus-pedidos/${data as string}`
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salesperson-links'] }),
  })
}

export function useRevokeSalespersonLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (salespersonId: string) => {
      const { error } = await supabase.rpc('sales_link_revoke', { p_salesperson: salespersonId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salesperson-links'] }),
  })
}
