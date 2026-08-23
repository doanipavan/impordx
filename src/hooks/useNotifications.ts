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
        .limit(50)
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
