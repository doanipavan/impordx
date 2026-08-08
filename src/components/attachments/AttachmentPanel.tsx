import { useRef, useState, DragEvent } from 'react'
import { Upload, File, Trash2, Download, X, Eye, FileText, Image as ImageIcon } from 'lucide-react'
import { useAttachments, useUploadAttachment, useDeleteAttachment, getSignedUrl } from '../../hooks/useAttachments'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Attachment } from '../../types'
import { cn, formatFileSize, formatDateTime } from '../../lib/utils'

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
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) { toast(`"${file.name}" not supported`, 'error'); continue }
      const maxSize = file.type.startsWith('image/') ? MAX_IMAGE_SIZE : MAX_PDF_SIZE
      if (file.size > maxSize) { toast(`"${file.name}" exceeds size limit`, 'error'); continue }
      setUploading(p => [...p, file.name])
      try {
        await uploadAttachment.mutateAsync({ cardId, file })
        toast(`"${file.name}" uploaded`, 'success')
      } catch {
        toast(`Failed to upload "${file.name}"`, 'error')
      } finally {
        setUploading(p => p.filter(n => n !== file.name))
      }
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false)
    uploadFiles(Array.from(e.dataTransfer.files))
  }

  async function handlePreview(att: Attachment) {
    setLoadingId(att.id)
    try { setPreview(await getSignedUrl(att.file_url)) }
    catch { toast('Failed to load preview', 'error') }
    finally { setLoadingId(null) }
  }

  async function handleDownload(att: Attachment) {
    setLoadingId(att.id)
    try {
      const url = await getSignedUrl(att.file_url)
      const a = document.createElement('a'); a.href = url; a.download = att.filename; a.target = '_blank'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch { toast('Failed to download', 'error') }
    finally { setLoadingId(null) }
  }

  async function handleDelete(att: Attachment) {
    if (!confirm(`Delete "${att.filename}"?`)) return
    try { await deleteAttachment.mutateAsync({ id: att.id, cardId, fileUrl: att.file_url }); toast('Deleted', 'info') }
    catch { toast('Failed to delete', 'error') }
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'
        )}
      >
        <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WEBP, PDF — max 10 MB per image, 20 MB per PDF</p>
        <input ref={inputRef} type="file" className="hidden" multiple accept={ACCEPTED.join(',')}
          onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
      </div>

      {/* Uploading */}
      {uploading.map(name => (
        <div key={name} className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Uploading "{name}"...
        </div>
      ))}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && attachments.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <File className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No attachments yet</p>
        </div>
      )}

      {/* Timeline */}
      {attachments.length > 0 && (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-3">
            {attachments.map(att => {
              const isImage = att.file_type.startsWith('image/')
              const canDelete = att.user_id === user?.id || user?.role === 'admin'
              const isLoading = loadingId === att.id

              return (
                <div key={att.id} className="flex gap-3 group relative">
                  {/* Dot */}
                  <div className={cn(
                    'h-9 w-9 rounded-full border-2 border-background flex items-center justify-center shrink-0 z-10 mt-0.5',
                    isImage ? 'bg-blue-100' : 'bg-amber-100'
                  )}>
                    {isImage
                      ? <ImageIcon className="h-4 w-4 text-blue-600" />
                      : <FileText className="h-4 w-4 text-amber-600" />
                    }
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-card border border-border rounded-lg p-3 hover:shadow-card-hover transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" title={att.filename}>{att.filename}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatFileSize(att.file_size)} · {formatDateTime(att.created_at)}
                        </p>
                        {att.user && (
                          <p className="text-xs text-muted-foreground">by {att.user.full_name}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {isImage && (
                          <button onClick={() => handlePreview(att)} disabled={isLoading}
                            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent" title="Preview">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDownload(att)} disabled={isLoading}
                          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent" title="Download">
                          {isLoading ? <div className="h-3 w-3 border border-primary border-t-transparent rounded-full animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        </button>
                        {canDelete && (
                          <button onClick={() => handleDelete(att)}
                            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setPreview(null)}>
          <button className="absolute top-4 right-4 text-white"><X className="h-6 w-6" /></button>
          <img src={preview} alt="Preview" className="max-h-[90vh] max-w-[90vw] object-contain rounded" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
