import { useEffect, useRef, useState, DragEvent } from 'react'
import { Upload, File, Trash2, Download, X, Eye, FileText, Image as ImageIcon, CheckCircle2, XCircle } from 'lucide-react'
import { useAttachments, useUploadAttachment, useDeleteAttachment, useApproveAttachment, useUnapproveAttachment, useMarkAsSample, useReviewSample, getSignedUrl } from '../../hooks/useAttachments'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Attachment } from '../../types'
import { cn, formatFileSize, formatDateTime, formatRelative } from '../../lib/utils'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_PDF_SIZE = 20 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

export function AttachmentPanel({ cardId }: { cardId: string }) {
  const { data: attachments = [], isLoading } = useAttachments(cardId)
  const uploadAttachment = useUploadAttachment()
  const deleteAttachment = useDeleteAttachment()
  const approveAttachment = useApproveAttachment()
  const unapproveAttachment = useUnapproveAttachment()
  const markAsSample = useMarkAsSample()
  const reviewSample = useReviewSample()
  const { user } = useAuth()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  // Thumbnails are stored as private paths, so each needs its own signed URL.
  // The ref tracks which ids were already requested so re-renders don't re-sign.
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const requestedThumbs = useRef<Set<string>>(new Set())

  useEffect(() => {
    const pending = attachments.filter(a => a.thumbnail_url && !requestedThumbs.current.has(a.id))
    if (pending.length === 0) return
    pending.forEach(a => requestedThumbs.current.add(a.id))

    let cancelled = false
    Promise.all(pending.map(async a => {
      try { return [a.id, await getSignedUrl(a.thumbnail_url!)] as const }
      catch { return null } // a missing thumbnail just falls back to the icon
    })).then(entries => {
      if (cancelled) return
      const resolved = entries.filter((e): e is readonly [string, string] => e !== null)
      if (resolved.length > 0) setThumbUrls(prev => ({ ...prev, ...Object.fromEntries(resolved) }))
    })
    return () => { cancelled = true }
  }, [attachments])

  const approvedAtt = attachments.find(a => a.approved_at)
  const canApprove = user?.role === 'admin' || user?.role === 'member'
  const canUnapprove = user?.role === 'admin'

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) { toast(`"${file.name}" not supported`, 'error'); continue }
      const maxSize = file.type.startsWith('image/') ? MAX_IMAGE_SIZE : MAX_PDF_SIZE
      if (file.size > maxSize) { toast(`"${file.name}" exceeds size limit`, 'error'); continue }
      setUploading(p => [...p, file.name])
      try {
        await uploadAttachment.mutateAsync({ cardId, file })
        toast(`"${file.name}" uploaded`, 'success')
      } catch { toast(`Failed to upload "${file.name}"`, 'error') }
      finally { setUploading(p => p.filter(n => n !== file.name)) }
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

  async function handleApprove(att: Attachment) {
    try {
      await approveAttachment.mutateAsync({ id: att.id, cardId, currentApprovedId: approvedAtt?.id, note: approvalNote })
      toast(`"${att.filename}" marked as approved artwork`, 'success')
      setApprovingId(null)
      setApprovalNote('')
    } catch (err) {
      console.error('Failed to approve:', err)
      toast('Failed to approve', 'error')
    }
  }

  async function handleUnapprove(att: Attachment) {
    if (!confirm(`Remove approval from "${att.filename}"?`)) return
    try {
      await unapproveAttachment.mutateAsync({ id: att.id, cardId })
      toast(`Approval removed from "${att.filename}"`, 'info')
    } catch { toast('Failed to remove approval', 'error') }
  }

  async function handleToggleSample(att: Attachment) {
    try {
      await markAsSample.mutateAsync({ id: att.id, cardId, isSample: !att.is_sample })
      toast(att.is_sample ? 'No longer marked as a sample' : 'Marked as a digital sample', 'info')
    } catch (err) {
      console.error('Failed to flag sample:', err)
      toast('Failed to update', 'error')
    }
  }

  async function handleReview(att: Attachment, status: 'approved' | 'rejected', note?: string) {
    try {
      await reviewSample.mutateAsync({ id: att.id, cardId, status, note })
      toast(status === 'approved' ? 'Sample approved' : 'Sample rejected', status === 'approved' ? 'success' : 'info')
      setRejectingId(null)
      setRejectNote('')
    } catch (err) {
      console.error('Failed to review sample:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ?? 'Failed to review sample', 'error')
    }
  }

  async function handleDelete(att: Attachment) {
    if (!confirm(`Delete "${att.filename}"?`)) return
    try { await deleteAttachment.mutateAsync({ id: att.id, cardId, fileUrl: att.file_url }); toast('Deleted', 'info') }
    catch { toast('Failed to delete', 'error') }
  }

  return (
    <div className="space-y-4">
      {/* Approved artwork banner */}
      {approvedAtt && (
        <div className="rounded-lg border-2 border-green-400 bg-green-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm font-semibold text-green-800">Approved Artwork</p>
            <span className="text-xs text-green-700 ml-auto" title={formatRelative(approvedAtt.approved_at!)}>
              {formatDateTime(approvedAtt.approved_at!)}
            </span>
          </div>
          <div className="flex items-center gap-3 bg-white rounded-md p-2 border border-green-200">
            {thumbUrls[approvedAtt.id] ? (
              <button onClick={() => handlePreview(approvedAtt)} title="Open preview"
                className="shrink-0 h-12 w-12 rounded overflow-hidden border border-green-200 hover:border-green-400 transition-colors">
                <img src={thumbUrls[approvedAtt.id]} alt="" className="h-full w-full object-cover block" />
              </button>
            ) : (
              <div className="h-10 w-10 bg-green-50 rounded flex items-center justify-center shrink-0">
                {approvedAtt.file_type.startsWith('image/') ? <ImageIcon className="h-5 w-5 text-green-600" /> : <FileText className="h-5 w-5 text-green-600" />}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{approvedAtt.filename}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(approvedAtt.file_size)}</p>
            </div>
            <button onClick={() => handleDownload(approvedAtt)} disabled={loadingId === approvedAtt.id}
              className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 font-medium px-2 py-1 rounded hover:bg-green-100 transition-colors">
              {loadingId === approvedAtt.id ? <div className="h-3 w-3 border border-green-600 border-t-transparent rounded-full animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download
            </button>
            {canUnapprove && (
              <button onClick={() => handleUnapprove(approvedAtt)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive font-medium px-2 py-1 rounded hover:bg-destructive/10 transition-colors"
                title="Remove approval">
                <XCircle className="h-3.5 w-3.5" />
                Unapprove
              </button>
            )}
          </div>
          {approvedAtt.approval_note && (
            <div className="bg-white rounded-md p-2 border border-green-200">
              <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-0.5">Approval note</p>
              <p className="text-sm text-green-900 whitespace-pre-wrap">{approvedAtt.approval_note}</p>
            </div>
          )}
          {approvedAtt.approved_by_user && (
            <p className="text-[10px] text-green-600">Approved by {approvedAtt.approved_by_user.full_name}</p>
          )}
        </div>
      )}

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn('border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'
        )}
      >
        <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WEBP, PDF — max 10 MB per image, 20 MB per PDF</p>
        <input ref={inputRef} type="file" className="hidden" multiple accept={ACCEPTED.join(',')}
          onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
      </div>

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
          <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-3">
            {attachments.map(att => {
              const isImage = att.file_type.startsWith('image/')
              const isApproved = !!att.approved_at
              const canDelete = att.user_id === user?.id || user?.role === 'admin'
              const isLoading = loadingId === att.id

              return (
                <div key={att.id} className="flex gap-3 group relative">
                  <div className={cn(
                    'h-9 w-9 rounded-full border-2 border-background flex items-center justify-center shrink-0 z-10 mt-0.5',
                    isApproved ? 'bg-green-100' : isImage ? 'bg-blue-100' : 'bg-amber-100'
                  )}>
                    {isApproved
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : isImage
                        ? <ImageIcon className="h-4 w-4 text-blue-600" />
                        : <FileText className="h-4 w-4 text-amber-600" />
                    }
                  </div>

                  <div className={cn(
                    'flex-1 bg-card border rounded-lg p-3 hover:shadow-card-hover transition-all',
                    isApproved ? 'border-green-300 bg-green-50/30' : 'border-border'
                  )}>
                    <div className="flex items-start gap-3">
                      {thumbUrls[att.id] && (
                        <button onClick={() => handlePreview(att)} title="Open preview"
                          className="shrink-0 rounded overflow-hidden border border-border hover:border-primary/50 transition-colors">
                          <img src={thumbUrls[att.id]} alt="" className="h-14 w-14 object-cover block" />
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{att.filename}</p>
                          {isApproved && (
                            <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">✓ APPROVED</span>
                          )}
                          {att.is_sample && <SampleBadge status={att.sample_status} />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(att.file_size)} · {formatDateTime(att.created_at)}</p>
                        {att.user && <p className="text-xs text-muted-foreground">by {att.user.full_name}</p>}
                      </div>

                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {/* Approve button — only for member/admin, only images/PDFs */}
                        {canApprove && !isApproved && approvingId !== att.id && (
                          <button onClick={() => { setApprovingId(att.id); setApprovalNote('') }}
                            className="h-7 px-2 rounded flex items-center gap-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 font-medium"
                            title="Mark as approved artwork">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </button>
                        )}
                        <button onClick={() => handleToggleSample(att)}
                          className={cn('h-7 px-2 rounded flex items-center gap-1 text-xs font-medium border',
                            att.is_sample
                              ? 'text-muted-foreground bg-muted border-border hover:bg-accent'
                              : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100')}
                          title={att.is_sample ? 'Remove the sample flag' : 'Flag this file as a digital sample'}>
                          {att.is_sample ? 'Not a sample' : 'It is a sample'}
                        </button>
                        {isImage && (
                          <button onClick={() => handlePreview(att)} disabled={isLoading}
                            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDownload(att)} disabled={isLoading}
                          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
                          {isLoading ? <div className="h-3 w-3 border border-primary border-t-transparent rounded-full animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        </button>
                        {canDelete && !isApproved && (
                          <button onClick={() => handleDelete(att)}
                            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* A sample carries its verdict and, when refused, the reason —
                        so the factory is never sent back to work without one. */}
                    {att.is_sample && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/70">
                        {att.sample_review_note && (
                          <p className={cn('text-xs mb-2 whitespace-pre-wrap',
                            att.sample_status === 'rejected' ? 'text-red-700' : 'text-green-800')}>
                            <span className="font-semibold">
                              {att.sample_status === 'rejected' ? 'Rejected: ' : 'Note: '}
                            </span>
                            {att.sample_review_note}
                          </p>
                        )}

                        {att.sample_reviewed_at && (
                          <p className="text-[10px] text-muted-foreground mb-2">
                            Reviewed {formatDateTime(att.sample_reviewed_at)}
                            {att.sample_reviewer && ` by ${att.sample_reviewer.full_name}`}
                          </p>
                        )}

                        {canApprove && rejectingId !== att.id && (
                          <div className="flex flex-wrap gap-2">
                            {att.sample_status !== 'approved' && (
                              <button onClick={() => handleReview(att, 'approved')}
                                className="h-7 px-3 rounded flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve sample
                              </button>
                            )}
                            {att.sample_status !== 'rejected' && (
                              <button onClick={() => { setRejectingId(att.id); setRejectNote('') }}
                                className="h-7 px-3 rounded flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200">
                                <XCircle className="h-3.5 w-3.5" /> Reject
                              </button>
                            )}
                          </div>
                        )}

                        {canApprove && rejectingId === att.id && (
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-red-800 block">
                              Why is it rejected? <span className="text-muted-foreground font-normal">(required)</span>
                            </label>
                            <textarea
                              value={rejectNote}
                              onChange={e => setRejectNote(e.target.value)}
                              rows={2}
                              autoFocus
                              placeholder="What is wrong, and what should change..."
                              className="w-full text-sm rounded-md border border-input bg-background px-2.5 py-1.5 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleReview(att, 'rejected', rejectNote)}
                                disabled={!rejectNote.trim() || reviewSample.isPending}
                                className="h-7 px-3 rounded flex items-center gap-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                                <XCircle className="h-3.5 w-3.5" /> Confirm rejection
                              </button>
                              <button onClick={() => { setRejectingId(null); setRejectNote('') }}
                                className="h-7 px-3 rounded text-xs text-muted-foreground hover:bg-accent">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Approving is the moment the reason is known, so the note is
                        captured here rather than left to a later comment. */}
                    {approvingId === att.id && (
                      <div className="mt-3 pt-3 border-t border-green-200 space-y-2">
                        <label className="text-xs font-medium text-green-800 block">
                          Approval note <span className="text-muted-foreground font-normal">(optional)</span>
                        </label>
                        <textarea
                          value={approvalNote}
                          onChange={e => setApprovalNote(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder="What is being approved, and any condition attached to it..."
                          className="w-full text-sm rounded-md border border-input bg-background px-2.5 py-1.5 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(att)} disabled={approveAttachment.isPending}
                            className="h-7 px-3 rounded flex items-center gap-1 text-xs text-white bg-green-600 hover:bg-green-700 font-medium disabled:opacity-60">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirm approval
                          </button>
                          <button onClick={() => { setApprovingId(null); setApprovalNote('') }}
                            className="h-7 px-3 rounded text-xs text-muted-foreground hover:bg-accent">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setPreview(null)}>
          <button className="absolute top-4 right-4 text-white"><X className="h-6 w-6" /></button>
          <img src={preview} alt="Preview" className="max-h-[90vh] max-w-[90vw] object-contain rounded" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

// A sample's verdict, readable at a glance without opening anything.
function SampleBadge({ status }: { status?: 'pending' | 'approved' | 'rejected' }) {
  const style = status === 'approved' ? 'text-green-700 bg-green-100'
    : status === 'rejected' ? 'text-red-700 bg-red-100'
    : 'text-blue-700 bg-blue-100'
  const label = status === 'approved' ? 'SAMPLE · APPROVED'
    : status === 'rejected' ? 'SAMPLE · REJECTED'
    : 'SAMPLE · AWAITING REVIEW'

  return (
    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0', style)}>
      {label}
    </span>
  )
}
