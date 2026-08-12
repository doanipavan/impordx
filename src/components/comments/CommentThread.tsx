import { useState, useRef } from 'react'
import { Edit2, Trash2, Check, X, MessageSquare, Paperclip, FileText, Image as ImageIcon, Reply } from 'lucide-react'
import { useComments, useAddComment, useEditComment, useDeleteComment } from '../../hooks/useComments'
import { useUploadAttachment } from '../../hooks/useAttachments'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { formatRelative, cn, formatFileSize } from '../../lib/utils'
import { Comment } from '../../types'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

export function CommentThread({ cardId }: { cardId: string }) {
  const { data: comments = [], isLoading } = useComments(cardId)

  const topLevel = comments.filter(c => !c.parent_id)
  const repliesByParent = comments.reduce<Record<string, Comment[]>>((acc, c) => {
    if (c.parent_id) (acc[c.parent_id] ??= []).push(c)
    return acc
  }, {})

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>

  return (
    <div className="space-y-5">
      {comments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No comments yet. Start the conversation.</p>
        </div>
      )}

      {topLevel.map(comment => (
        <CommentItem key={comment.id} comment={comment} cardId={cardId} replies={repliesByParent[comment.id] ?? []} />
      ))}

      <CommentComposer cardId={cardId} />
    </div>
  )
}

function CommentComposer({ cardId, parentId, onDone, autoFocus, placeholder = 'Write a comment...' }: {
  cardId: string
  parentId?: string
  onDone?: () => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const { user } = useAuth()
  const addComment = useAddComment()
  const uploadAttachment = useUploadAttachment()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: File[]) {
    const valid = incoming.filter(f => ACCEPTED.includes(f.type))
    const invalid = incoming.filter(f => !ACCEPTED.includes(f.type))
    if (invalid.length) toast(`${invalid.length} unsupported file(s) skipped`, 'error')
    setFiles(prev => [...prev, ...valid])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() && files.length === 0) return
    setSubmitting(true)
    try {
      // Upload files first
      const uploadedNames: string[] = []
      for (const file of files) {
        await uploadAttachment.mutateAsync({ cardId, file })
        uploadedNames.push(file.name)
      }

      // Build comment body — append file refs if any
      let finalBody = body.trim()
      if (uploadedNames.length > 0) {
        const suffix = uploadedNames.map(n => `📎 ${n}`).join('\n')
        finalBody = finalBody ? `${finalBody}\n\n${suffix}` : suffix
      }

      await addComment.mutateAsync({ cardId, body: finalBody, parentId })
      setBody('')
      setFiles([])
      onDone?.()
    } catch {
      toast('Failed to post comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <Avatar name={user.full_name} imageUrl={user.avatar_url} size="sm" className="shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <div
          className={cn('rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring transition-colors', files.length > 0 && 'border-primary/40')}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
        >
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={placeholder}
            rows={parentId ? 2 : 3}
            className="border-0 shadow-none focus-visible:ring-0 resize-none rounded-b-none"
            autoFocus={autoFocus}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e) }}
          />

          {/* Queued files */}
          {files.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-xs">
                  {f.type.startsWith('image/') ? <ImageIcon className="h-3 w-3 text-blue-500" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <span className="text-muted-foreground">{formatFileSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Attach files"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Attach file
            </button>
            <div className="flex items-center gap-3">
              {parentId && (
                <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
              )}
              <p className="text-xs text-muted-foreground hidden sm:block">Ctrl+Enter to submit</p>
              <Button type="submit" size="sm" loading={submitting} disabled={!body.trim() && files.length === 0}>
                {parentId ? 'Reply' : 'Post comment'}
              </Button>
            </div>
          </div>
        </div>

        <input ref={fileRef} type="file" className="hidden" multiple accept={ACCEPTED.join(',')}
          onChange={e => addFiles(Array.from(e.target.files ?? []))} />
      </div>
    </form>
  )
}

function CommentItem({ comment, cardId, replies = [] }: { comment: Comment; cardId: string; replies?: Comment[] }) {
  const { user } = useAuth()
  const [replying, setReplying] = useState(false)

  return (
    <div>
      <CommentBody comment={comment} cardId={cardId} isOwn={comment.user_id === user?.id} />

      <div className="ml-11 mt-1.5">
        {!replying && (
          <button onClick={() => setReplying(true)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 -ml-2 rounded hover:bg-accent">
            <Reply className="h-3 w-3" />Reply
          </button>
        )}
      </div>

      {replies.length > 0 && (
        <div className="ml-11 mt-3 space-y-4 border-l-2 border-border pl-4">
          {replies.map(reply => (
            <CommentBody key={reply.id} comment={reply} cardId={cardId} isOwn={reply.user_id === user?.id} />
          ))}
        </div>
      )}

      {replying && (
        <div className="ml-11 mt-3">
          <CommentComposer cardId={cardId} parentId={comment.id} autoFocus placeholder={`Reply to ${comment.user?.full_name ?? 'comment'}...`} onDone={() => setReplying(false)} />
        </div>
      )}
    </div>
  )
}

function CommentBody({ comment, cardId, isOwn }: { comment: Comment; cardId: string; isOwn: boolean }) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [confirming, setConfirming] = useState(false)
  const editComment = useEditComment()
  const deleteComment = useDeleteComment()
  const toast = useToast()

  async function handleEdit() {
    const text = editBody.trim()
    if (!text || text === comment.body) { setEditing(false); return }
    try {
      await editComment.mutateAsync({ id: comment.id, cardId, body: text })
      setEditing(false)
    } catch { toast('Failed to update comment', 'error') }
  }

  async function handleDelete() {
    try { await deleteComment.mutateAsync({ id: comment.id, cardId }) }
    catch { toast('Failed to delete comment', 'error') }
  }

  const author = comment.user
  if (!author) return null

  // Parse 📎 lines as attachment references
  const lines = comment.body.split('\n')
  const attachmentLines = lines.filter(l => l.startsWith('📎 '))
  const textLines = lines.filter(l => !l.startsWith('📎 '))
  const textBody = textLines.join('\n').trim()

  return (
    <div className="flex gap-3 group">
      <Avatar name={author.full_name} imageUrl={author.avatar_url} size="sm" className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold">{author.full_name}</span>
          <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
            author.role === 'admin' || author.role === 'member' ? 'bg-primary/10 text-primary' : 'bg-amber-50 text-amber-700')}>
            {author.role === 'viewer' ? 'DEQI' : 'Redantex'}
          </span>
          <span className="text-xs text-muted-foreground">{formatRelative(comment.created_at)}</span>
          {comment.edited && <span className="text-xs text-muted-foreground italic">(edited)</span>}
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={3} className="resize-none text-sm" autoFocus />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEdit} loading={editComment.isPending}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditBody(comment.body) }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            {textBody && <p className="text-sm whitespace-pre-wrap leading-relaxed">{textBody}</p>}

            {/* Attachment badges */}
            {attachmentLines.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attachmentLines.map((line, i) => {
                  const filename = line.replace('📎 ', '')
                  return (
                    <div key={i} className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs border border-border">
                      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate max-w-[180px]">{filename}</span>
                      <span className="text-muted-foreground text-[10px]">→ Files tab</span>
                    </div>
                  )
                })}
              </div>
            )}

            {isOwn && (
              <div className="mt-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditing(true); setEditBody(comment.body) }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-accent">
                  <Edit2 className="h-3 w-3" />Edit
                </button>
                {!confirming ? (
                  <button onClick={() => setConfirming(true)}
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1 rounded hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" />Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-destructive font-medium">Delete?</span>
                    <button onClick={handleDelete} className="px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20"><Check className="h-3 w-3" /></button>
                    <button onClick={() => setConfirming(false)} className="px-2 py-1 rounded hover:bg-accent"><X className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
