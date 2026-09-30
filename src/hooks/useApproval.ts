import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { receiptFromSignature, StoredSignature, StoredFile } from '../lib/approvalReceipt'

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
      // Registra que o link foi aberto. Falhar aqui não pode impedir a leitura:
      // é prova de recebimento, não pré-requisito para ver a arte.
      supabase.rpc('approval_touch', { p_token: token }).then(undefined, () => {})
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
      /** CPF ou CNPJ declarado por quem assina. Opcional. */
      document?: string
      note?: string
      /** O retrato do que estava na tela. Vira hash do lado do banco. */
      snapshot: unknown
    }) => {
      const { data, error } = await supabase.rpc('approval_sign', {
        p_token: token,
        p_name: input.name,
        p_email: input.email,
        p_decision: input.decision,
        p_accepted_terms: input.acceptedTerms,
        p_snapshot: input.snapshot,
        p_note: input.note ?? null,
        p_user_agent: navigator.userAgent,
        p_document: input.document ?? null,
      })
      if (error) throw error
      return data as { ok: boolean; verify_code: string; at: string }
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

export interface ClientResponse {
  id: string
  decision: 'approved' | 'changes'
  signer_name: string
  signer_email: string
  note: string | null
  signed_at: string
  accepted_terms: boolean
  verify_code: string | null
}

/**
 * O que o cliente respondeu neste card, do mais recente para o mais antigo.
 *
 * Existe porque o pedido de ajuste dele ficava só no histórico e no sino —
 * dois lugares onde o texto do pedido não aparecia. A resposta pertence ao
 * card, ao lado da arte de que ela fala.
 */
export function useClientResponses(cardId: string) {
  return useQuery({
    queryKey: ['client-responses', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_signatures')
        .select('id, decision, signer_name, signer_email, note, signed_at, accepted_terms, verify_code, request:approval_requests!inner(card_id)')
        .eq('request.card_id', cardId)
        .order('signed_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ClientResponse[]
    },
    enabled: !!cardId,
  })
}

/**
 * Remonta o comprovante que o cliente recebeu, a partir do que ficou gravado.
 *
 * O PDF saía uma vez só, na tela dele, no instante da assinatura — a Redantex
 * não ficava com cópia e não tinha como pedir de novo. Quando alguém
 * perguntasse "prove que ele aprovou", a resposta estava no banco e não saía
 * de lá.
 *
 * O documento é remontado do retrato (`snapshot`), não dos dados de hoje: é o
 * retrato que o hash fecha, e é ele que vale como prova. Se o título do card
 * mudar amanhã, o comprovante continua dizendo o que estava na tela naquele
 * dia. A arte vem dos anexos que foram enviados naquele link, em ordem.
 *
 * Só a Redantex lê estas tabelas (`current_user_is_redantex()`), então o
 * fornecedor não alcança nada disto.
 */
interface SignatureRow extends StoredSignature {
  request?: { attachment_ids: string[] }
}

export function useApprovalReceipt(signatureId: string | undefined) {
  return useQuery({
    queryKey: ['approval-receipt', signatureId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_signatures')
        .select('decision, signer_name, signer_email, signer_document, note, signed_at,'
          + ' accepted_terms, verify_code, snapshot, request:approval_requests!inner(attachment_ids)')
        .eq('id', signatureId!)
        .single()
      if (error) throw error

      // O tipo gerado não entende a tabela embutida e desiste da linha inteira;
      // o mesmo desvio que `useClientResponses` já fazia.
      const sig = data as unknown as SignatureRow
      const ids = sig.request?.attachment_ids ?? []
      const { data: files } = ids.length
        ? await supabase.from('attachments').select('id, filename, file_url').in('id', ids)
        : { data: [] }

      return receiptFromSignature(sig, ids, (files ?? []) as StoredFile[], publicFileUrl)
    },
    enabled: !!signatureId,
    staleTime: Infinity,
  })
}

export interface VerifiedSignature {
  found: boolean
  decision?: 'approved' | 'changes'
  reference?: string
  signer_name?: string
  signer_email?: string
  signer_document?: string | null
  signed_at?: string
  accepted_terms?: boolean
  snapshot_hash?: string
  ip?: string | null
  sent_at?: string
  first_opened_at?: string | null
  open_count?: number
}

/** A conferência pública de um comprovante, pelo código impresso nele. */
export function useVerifySignature(code: string | undefined) {
  return useQuery({
    queryKey: ['verify', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('approval_verify', { p_code: code })
      if (error) throw error
      return data as VerifiedSignature
    },
    enabled: !!code && code.length >= 6,
    retry: false,
  })
}
