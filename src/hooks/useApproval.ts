import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * O link de aprovação do cliente, dos dois lados.
 *
 * Do lado da Redantex, `useCreateApprovalLink` devolve o token uma única vez —
 * ele não é guardado em claro no banco e não há como pedi-lo de novo. Do lado
 * do cliente, `useApprovalView` e `useSignApproval` falam com funções que
 * rodam como dono e entregam só os campos da arte: quem abre o link não tem
 * sessão, e a chave anônima não lê `cards` (migração 031).
 */

export interface ApprovalFile { path: string; filename: string; type: string }

export interface ApprovalView {
  state: 'open' | 'signed' | 'expired' | 'revoked' | 'unknown'
  reference?: string
  title?: string
  client?: string
  files?: ApprovalFile[]
  specs?: Array<{ label: string; value: string }> | null
  notes?: string | null
  expires_at?: string
  sent_by?: string
  signature?: {
    decision: 'approved' | 'changes'
    name: string
    email: string
    at: string
    note?: string | null
    accepted_terms?: boolean
  } | null
}

/**
 * O endereço público do arquivo no storage.
 *
 * O bucket é público e o caminho é um UUID — a mesma postura que o hub já
 * tem para os anexos (ver CLAUDE.md). Uma URL assinada exigiria sessão, e
 * quem abre este link não tem nenhuma.
 */
export function publicFileUrl(path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/storage/v1/object/public/attachments/${path}`
}

export function useApprovalView(token: string | undefined) {
  return useQuery({
    queryKey: ['approval', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('approval_view', { p_token: token })
      if (error) throw error
      return data as ApprovalView
    },
    enabled: !!token,
    retry: false,
    staleTime: 0,
  })
}

export function useSignApproval(token: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      email: string
      decision: 'approved' | 'changes'
      acceptedTerms: boolean
      note?: string
      /** O retrato do que estava na tela. Vira hash do lado do banco. */
      snapshot: unknown
    }) => {
      const { error } = await supabase.rpc('approval_sign', {
        p_token: token,
        p_name: input.name,
        p_email: input.email,
        p_decision: input.decision,
        p_accepted_terms: input.acceptedTerms,
        p_snapshot: input.snapshot,
        p_note: input.note ?? null,
        p_user_agent: navigator.userAgent,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval', token] }),
  })
}

export function useCreateApprovalLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cardId, attachmentIds, includeSpecs }: {
      cardId: string; attachmentIds: string[]; includeSpecs: boolean
    }) => {
      const { data, error } = await supabase
        .rpc('approval_create', {
          p_card: cardId,
          p_attachments: attachmentIds,
          p_include_specs: includeSpecs,
        })
        .single<{ token: string; expires_at: string }>()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['activity', vars.cardId] })
      qc.invalidateQueries({ queryKey: ['approval-requests', vars.cardId] })
    },
  })
}

export interface ApprovalRequestRow {
  id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  signed_at: string | null
  attachment_ids: string[]
  include_specs: boolean
}

/** Os links já enviados deste card — para saber o que está no ar. */
export function useApprovalRequests(cardId: string) {
  return useQuery({
    queryKey: ['approval-requests', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('id, created_at, expires_at, revoked_at, signed_at, attachment_ids, include_specs')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ApprovalRequestRow[]
    },
    enabled: !!cardId,
  })
}

export function useRevokeApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; cardId: string }) => {
      const { error } = await supabase.rpc('approval_revoke', { p_request: id })
      if (error) throw error
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['approval-requests', vars.cardId] }),
  })
}
