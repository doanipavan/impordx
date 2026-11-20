import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Notification } from '../types'
import { useAuth } from './useAuth'

export function useNotifications() {
  const qc = useQueryClient()
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(`*, card:cards(id, title, board, ref_number), actor:users!notifications_actor_id_fkey(id, full_name, avatar_url, email, role, created_at)`)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        // Cinquenta cobriam uns quatro dias do volume real — num sábado
        // deste mês chegaram 55 de uma vez — e a tela agora é um quadro de
        // dias, onde quatro colunas é pouco para quem volta de uma viagem.
        .limit(200)
      if (error) throw error
      return data as Notification[]
    },
    enabled: !!user,
  })

  // Single global realtime subscription — use a stable channel name
  useEffect(() => {
    if (!user) return
    const channelName = `notifications-${user.id}`
    // Check if channel already exists to avoid duplicate
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['notifications', user.id] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  return query
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user!.id).eq('read', false)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}

export function useUnreadCount() {
  const { data } = useNotifications()
  return data?.filter(n => !n.read).length ?? 0
}

/**
 * Marca como lidas as notificações que o filtro pega — todas elas, não só as
 * que couberam na tela.
 *
 * A conta é feita no banco: a tela carrega 200 e o filtro costuma pegar mais.
 * Quem clica em "Files" e manda limpar quer os 265 arquivos, não os cinco
 * dias que estavam à vista.
 */
export function useSweepRead() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (filtro: { types?: string[]; actorId?: string | null }) => {
      let q = supabase.from('notifications')
        .update({ read: true })
        .eq('user_id', user!.id)
        .eq('read', false)
      if (filtro.types?.length) q = q.in('type', filtro.types)
      // `actorId` nulo é o sistema — notificação sem autor —, e isso é
      // diferente de "não filtrar por autor", que é `undefined`.
      if (filtro.actorId === null) q = q.is('actor_id', null)
      else if (filtro.actorId) q = q.eq('actor_id', filtro.actorId)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}

/** Marca um punhado por id — um cartão, ou um dia inteiro. */
export function useMarkManyRead() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return
      const { error } = await supabase.from('notifications')
        .update({ read: true })
        .eq('user_id', user!.id)
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}

/**
 * Os cards que esta pessoa pediu para parar de acompanhar.
 *
 * Silenciar não apaga o que já chegou: tira o card do caminho daqui para a
 * frente. O gatilho da 068 descarta a notificação antes de ela ser gravada.
 */
export function useMutedCards() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['muted-cards', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('muted_cards').select('card_id')
      if (error) throw error
      return (data ?? []).map((r) => (r as { card_id: string }).card_id)
    },
  })
}

export function useMuteCard() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ cardId, mute }: { cardId: string; mute: boolean }) => {
      const { error } = mute
        ? await supabase.from('muted_cards').insert({ user_id: user!.id, card_id: cardId })
        : await supabase.from('muted_cards').delete().eq('card_id', cardId)
      // Silenciar duas vezes não é erro — a chave já existe e o efeito é o
      // mesmo. Qualquer outra coisa sobe.
      if (error && error.code !== '23505') throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['muted-cards', user?.id] }),
  })
}
