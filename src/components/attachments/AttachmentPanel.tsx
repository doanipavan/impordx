import { useRef, useState, DragEvent, useCallback } from 'react'
import { Upload, File, Trash2, Download, X, Eye } from 'lucide-react'
import { useAttachments, useUploadAttachment, useDeleteAttachment, getSignedUrl } from '../../hooks/useAttachments'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Attachment } from '../../types'
import { cn, formatDate, formatFileSize } from '../../lib/utils'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_PDF_SIZE = 20 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

export function AttachmentPanel({ cardId }: { cardId: string }) {
  const { data: attachments = [], isLoading } = useAttachments(cardId)
  const uploadAttachment = useUploadAttachment()
  const deleteAttachment = useDeleteAttachment()
  const { user } = useAuth()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null)

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        toast(`"${file.name}" is not supported. Use JPG, PNG, WEBP or PDF.`, 'error')
        continue
      }
      const maxSize = file.type.startsWith('image/') ? MAX_IMAGE_SIZE : MAX_PDF_SIZE
      if (file.size > maxSize) {
        toast(`"${file.name}" exceeds the size limit.`, 'error')
        continue
      }
      setUploading((prev) => [...prev, file.name])
      try {
        await uploadAttachment.mutateAsync({ cardId, file })
        toast(`"${file.name}" uploaded`, 'success')
      } catch {
        toast(`Failed to upload "${file.name}". Check your connection and try again.`, 'error')
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name))
      }
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    uploadFiles(Array.from(e.dataTransfer.files))
  }

  async function handleDownload(att: Attachment) {
    setLoadingUrl(att.id)
    try {
      const url = await getSignedUrl(att.file_url)
      const a = document.createElement('a')
      a.href = url
      a.download = att.filename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast('Failed to generate download link. Try again.', 'error')
    } finally {
      setLoadingUrl(null)
    }
  }

  async function handlePreview(att: Attachment) {
    setLoadingUrl(att.id)
    try {
      const url = await getSignedUrl(att.file_url)
      setPreview(url)
    } catch {
      toast('Failed to load preview.', 'error')
    } finally {
      setLoadingUrl(null)
    }
  }

  async function handleDelete(att: Attachment) {
    if (!confirm(`Delete "${att.filename}"?`)) return
    try {
      await deleteAttachment.mutateAsync({ id: att.id, cardId, fileUrl: att.file_url })
      toast('File deleted', 'info')
    } catch {
      toast('Failed to delete file', 'error')
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'
        )}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium mb-1">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, PDF — max 10 MB per image, 20 MB per PDF</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED.join(',')}
          onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {/* Uploading */}
      {uploading.map((name) => (
        <div key={name} className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Uploading "{name}"...</span>
        </div>
      ))}

      {isLoading && <p className="text-sm text-muted-foreground">Loading files...</p>}

      {!isLoading && attachments.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <File className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No attachments yet</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {attachments.map((att) => (
          <AttachmentItem
            key={att.id}
            attachment={att}
            canDelete={att.user_id === user?.id || user?.role === 'admin'}
            loading={loadingUrl === att.id}
            onDownload={() => handleDownload(att)}
            onPreview={() => handlePreview(att)}
            onDelete={() => handleDelete(att)}
          />
        ))}
      </div>

      {/* Preview lightbox */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setPreview(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setPreview(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={preview} alt="Preview" className="max-h-[90vh] max-w-[90vw] object-contain rounded" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

function AttachmentItem({ attachment, canDelete, loading, onDelete, onDownload, onPreview }: {
  attachment: Attachment
  canDelete: boolean
  loading: boolean
  onDelete: () => void
  onDownload: () => void
  onPreview: () => void
}) {
  const isImage = attachment.file_type.startsWith('image/')

  return (
    <div className="group relative border border-border rounded-lg overflow-hidden bg-card hover:shadow-card-hover transition-all">
      <div
        className={cn('aspect-video bg-muted flex items-center justify-center', isImage && 'cursor-pointer')}
        onClick={isImage ? onPreview : undefined}
      >
        {isImage ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-100">
            <Eye className="h-6 w-6 text-muted-foreground opacity-50" />
          </div>
        ) : (
          <File className="h-8 w-8 text-muted-foreground" />
        )}
      </div>

      <div className="p-2">
        <p className="text-xs font-medium truncate" title={attachment.filename}>{attachment.filename}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</p>
      </div>

      {/* Actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onDownload}
          disabled={loading}
          className="h-6 w-6 rounded bg-white/90 flex items-center justify-center shadow-sm hover:bg-white disabled:opacity-50"
          title="Download"
        >
          {loading ? <div className="h-3 w-3 border border-primary border-t-transparent rounded-full animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            className="h-6 w-6 rounded bg-white/90 flex items-center justify-center shadow-sm hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
