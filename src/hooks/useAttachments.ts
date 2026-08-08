import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { Attachment } from '../types'
import { useAuth } from './useAuth'

// Extract storage path from URL or use raw path
function getStoragePath(fileUrl: string): string {
  // If it's already a path (not a full URL), return as-is
  if (!fileUrl.startsWith('http')) return fileUrl
  // Extract path after /attachments/
  const match = fileUrl.match(/\/attachments\/(.+)$/)
  return match ? match[1] : fileUrl
}

export async function getSignedUrl(fileUrl: string, expiresIn = 3600): Promise<string> {
  const path = getStoragePath(fileUrl)
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) throw error ?? new Error('Failed to sign URL')
  return data.signedUrl
}

export function useAttachments(cardId: string) {
  return useQuery({
    queryKey: ['attachments', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*, user:users(id, full_name, email, avatar_url, role, created_at)')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Attachment[]
    },
    enabled: !!cardId,
  })
}

export function useUploadAttachment() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ cardId, file }: { cardId: string; file: File }) => {
      const isImage = file.type.startsWith('image/')
      let uploadFile = file
      let thumbnailPath: string | null = null

      if (isImage && file.size > 500 * 1024) {
        uploadFile = await imageCompression(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 2000,
          useWebWorker: true,
        })
      }

      const ext = file.name.split('.').pop()
      const path = `${cardId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(path, uploadFile, { contentType: file.type })
      if (uploadError) throw uploadError

      // Create thumbnail for images
      if (isImage) {
        try {
          const thumb = await imageCompression(file, { maxSizeMB: 0.05, maxWidthOrHeight: 200, useWebWorker: true })
          thumbnailPath = `${cardId}/thumb-${Date.now()}.${ext}`
          await supabase.storage.from('attachments').upload(thumbnailPath, thumb, { contentType: file.type })
        } catch { /* thumbnail optional */ }
      }

      const { data, error } = await supabase
        .from('attachments')
        .insert({
          card_id: cardId,
          user_id: user!.id,
          filename: file.name,
          file_url: path,              // store path, not public URL
          file_type: file.type,
          file_size: file.size,
          thumbnail_url: thumbnailPath, // store path
        })
        .select('*, user:users(id, full_name, email, avatar_url, role, created_at)')
        .single()
      if (error) throw error
      return data as Attachment
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['attachments', vars.cardId] })
      supabase.from('activity_logs').insert({ card_id: vars.cardId, user_id: user!.id, action: 'uploaded', new_value: vars.file.name })
    },
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, cardId, fileUrl }: { id: string; cardId: string; fileUrl: string }) => {
      const path = getStoragePath(fileUrl)
      if (path) await supabase.storage.from('attachments').remove([path])
      const { error } = await supabase.from('attachments').delete().eq('id', id)
      if (error) throw error
      return cardId
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['attachments', vars.cardId] })
    },
  })
}
