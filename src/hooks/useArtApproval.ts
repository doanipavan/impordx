import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ArtApproval, ArtMap } from '../lib/orderRows'

/**
 * Quanto tempo a arte ficou com o cliente.
 *
 * Da **primeira** aprovação enviada até a **última** assinatura: quando a arte
 * voltou com alteração e foi reenviada, a espera entre as rodadas é espera
 * igual. Medir só a última rodada faria o MICCE, que levou 57 dias em duas
 * idas, aparecer como "aprovado no mesmo dia".
 *
 * `approval_requests` é lida só pela Redantex (política de SELECT
 * `current_user_is_redantex()`), então um login de fornecedor recebe zero
 * linhas e a perna azul simplesmente não existe para ele. Isso é o banco
 * decidindo, não a tela — é o que o CLAUDE.md pede.
 */
export function useArtApproval(cardIds: string[]) {
  const key = [...cardIds].sort().join(',')

  return useQuery({
    queryKey: ['art-approval', key],
    queryFn: async (): Promise<ArtMap> => {
      if (cardIds.length === 0) return new Map()
      const { data, error } = await supabase
        .from('approval_requests')
        .select('card_id, created_at, signed_at')
        .in('card_id', cardIds)
        .not('signed_at', 'is', null)
        .order('created_at', { ascending: true })
      if (error) throw error

      const by = new Map<string, ArtApproval>()
      for (const r of (data ?? []) as Array<{ card_id: string; created_at: string; signed_at: string }>) {
        const seen = by.get(r.card_id)
        by.set(r.card_id, seen
          ? {
              // A consulta vem ordenada, mas min/max explícitos sobrevivem a
              // alguém tirar o `order` daqui um dia.
              sent: r.created_at < seen.sent ? r.created_at : seen.sent,
              signed: r.signed_at > seen.signed ? r.signed_at : seen.signed,
              rounds: seen.rounds + 1,
            }
          : { sent: r.created_at, signed: r.signed_at, rounds: 1 })
      }
      return by
    },
    enabled: cardIds.length > 0,
    staleTime: 60 * 1000,
  })
}
