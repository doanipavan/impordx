import { useRef, useState } from 'react'
import { FileText, Upload, CheckCircle2, XCircle, Eye, Loader2 } from 'lucide-react'
import {
  useAttachments, useUploadAttachment, useMarkAttachment,
  useReviewAttachment, getSignedUrl,
} from '../../hooks/useAttachments'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { cn, formatDateTime, formatFileSize } from '../../lib/utils'
import { Card } from '../../types'

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

// The proforma lives here rather than in the Files tab, because deciding on it
// is a step in the order, not filing. Approving moves the card to PI Approved
// and starts DEQI's 60 days; rejecting sends it back with the reason attached.
export function PiPanel({ card }: { card: Card }) {
  const { data: attachments = [] } = useAttachments(card.id)
  const upload = useUploadAttachment()
  const mark = useMarkAttachment()
  const review = useReviewAttachment()
  const { user } = useAuth()
  const toast = useToast()

  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  const canReview = user?.role === 'admin' || user?.role === 'member'
  // The most recent one wins: a replacement PI supersedes the one before it.
  const pi = attachments.filter(a => a.kind === 'pi')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

  const status = pi?.review_status ?? 'pending'

  async function handleUpload(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast('The PI must be a PDF or an image', 'error')
      return
    }
    setBusy(true)
    try {
      const created = await upload.mutateAsync({ cardId: card.id, file })
      await mark.mutateAsync({ id: created.id, cardId: card.id, kind: 'pi' })
      toast('Proforma invoice uploaded', 'success')
    } catch (err) {
      console.error('PI upload failed:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Upload failed: ${detail}` : 'Upload failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleReview(next: 'approved' | 'rejected') {
    if (!pi) return
    setBusy(true)
    try {
      await review.mutateAsync({ id: pi.id, cardId: card.id, status: next, note })
      toast(next === 'approved'
        ? 'PI approved — the order moves to PI Approved and the 60 days start'
        : 'PI rejected — the order goes back for a new one', next === 'approved' ? 'success' : 'info')
      setRejecting(false)
      setNote('')
    } catch (err) {
      console.error('PI review failed:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ?? 'Could not save the decision', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function openPreview() {
    if (!pi) return
    try { setPreview(await getSignedUrl(pi.file_url)) }
    catch { toast('Could not open the file', 'error') }
  }

  const tone = status === 'approved' ? 'border-green-300 bg-green-50'
    : status === 'rejected' ? 'border-red-300 bg-red-50'
    : pi ? 'border-purple-300 bg-purple-50/60'
    : 'border-dashed border-border bg-muted/30'

  return (
    <div className={cn('rounded-lg border-2 p-4', tone)}>
      <div className="flex items-center gap-2 mb-3">
        <FileText className={cn('h-4 w-4 shrink-0',
          status === 'approved' ? 'text-green-600'
            : status === 'rejected' ? 'text-red-600'
            : 'text-purple-600')} />
        <p className="text-sm font-semibold">Proforma Invoice</p>
        {pi && (
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
            status === 'approved' ? 'text-green-700 bg-green-100'
              : status === 'rejected' ? 'text-red-700 bg-red-100'
              : 'text-purple-700 bg-purple-100')}>
            {status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'AWAITING REVIEW'}
          </span>
        )}
      </div>

      {!pi ? (
        <div>
          <p className="text-xs text-muted-foreground mb-2.5">
            No PI uploaded yet. DEQI attaches it here.
          </p>
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload PI
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-card rounded-md p-2.5 border border-border">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{pi.filename}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(pi.file_size)}
                {pi.user && ` · ${pi.user.full_name}`}
              </p>
            </div>
            <button onClick={openPreview}
              className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent">
              <Eye className="h-3.5 w-3.5" /> View
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent">
              Replace
            </button>
          </div>

          {/* A rejection without its reason just sends the factory back blind. */}
          {pi.review_note && (
            <div className={cn('rounded-md p-2.5 border',
              status === 'rejected' ? 'bg-card border-red-200' : 'bg-card border-green-200')}>
              <p className={cn('text-[10px] font-bold uppercase tracking-wide mb-0.5',
                status === 'rejected' ? 'text-red-700' : 'text-green-700')}>
                {status === 'rejected' ? 'Why it was rejected' : 'Note'}
              </p>
              <p className="text-sm whitespace-pre-wrap">{pi.review_note}</p>
            </div>
          )}

          {pi.reviewed_at && (
            <p className="text-[10px] text-muted-foreground">
              Reviewed {formatDateTime(pi.reviewed_at)}
              {pi.reviewer && ` by ${pi.reviewer.full_name}`}
            </p>
          )}

          {canReview && !rejecting && (
            <div className="flex flex-wrap gap-2">
              {status !== 'approved' && (
                <button onClick={() => handleReview('approved')} disabled={busy}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve PI
                </button>
              )}
              {status !== 'rejected' && (
                <button onClick={() => { setRejecting(true); setNote('') }} disabled={busy}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-60">
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              )}
            </div>
          )}

          {canReview && rejecting && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-red-800">
                What is wrong with it? <span className="font-normal text-muted-foreground">(required)</span>
              </label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} autoFocus
                placeholder="Price, quantity, terms — say what DEQI needs to change"
                className="w-full text-sm rounded-md border border-input bg-background px-2.5 py-1.5 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <div className="flex gap-2">
                <button onClick={() => handleReview('rejected')} disabled={!note.trim() || busy}
                  className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                  <XCircle className="h-3.5 w-3.5" /> Confirm rejection
                </button>
                <button onClick={() => { setRejecting(false); setNote('') }}
                  className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:bg-accent">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" className="hidden" accept={ACCEPTED.join(',')}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
          onClick={() => setPreview(null)}>
          <div className="bg-white rounded-lg w-[90vw] h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <iframe src={preview} title={pi?.filename ?? 'PI'} className="w-full h-full" />
          </div>
        </div>
      )}
    </div>
  )
}
