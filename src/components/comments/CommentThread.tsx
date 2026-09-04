import { useState, useRef, useEffect, Fragment } from 'react'
import { Edit2, Trash2, Check, X, MessageSquare, Paperclip, FileText, Image as ImageIcon, Reply, CheckCircle2 } from 'lucide-react'
import { useComments, useAddComment, useEditComment, useDeleteComment } from '../../hooks/useComments'
import { useAttachments, useUploadAttachment, useLinkAttachmentsToComment, getSignedUrl } from '../../hooks/useAttachments'
import { useUsers } from '../../hooks/useUsers'
import { useSuppliers } from '../../hooks/useSupplierFilter'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { formatRelative, formatDateTime, cn, formatFileSize } from '../../lib/utils'
import { Comment, User } from '../../types'

const ACCEPTED = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
]
// O bucket recusa acima de 50 MB. Sem este limite aqui a recusa chegaria como
// erro cru do servidor, depois de o arquivo inteiro ter subido.
const MAX_SIZE = 50 * 1024 * 1024
// Mentions are stored inline as @[Full Name] so we can render them as pills
// and resolve them back to user ids without a separate rich-text model.
const MENTION_PATTERN = /@\[([^\]]+)\]/g

export function CommentThread({ cardId }: { cardId: string }) {
  const { data: comments = [], isLoading } = useComments(cardId)

  // Newest exchange first, so what just happened is the first thing on screen.
  // Replies stay oldest-first inside their thread — a conversation read
  // backwards is a conversation you have to reassemble.
  const topLevel = comments.filter(c => !c.parent_id).slice().reverse()
  const repliesByParent = comments.reduce<Record<string, Comment[]>>((acc, c) => {
    if (c.parent_id) (acc[c.parent_id] ??= []).push(c)
    return acc
  }, {})

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>

  return (
    <div className="space-y-5">
      {/* Composer leads: with newest first, writing at the bottom would mean
          scrolling past the whole history to say anything. */}
      <div className="pb-5 border-b border-border">
        <CommentComposer cardId={cardId} />
      </div>

      {comments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No comments yet. Start the conversation.</p>
        </div>
      )}

      {topLevel.map(comment => (
        <CommentItem key={comment.id} comment={comment} cardId={cardId} replies={repliesByParent[comment.id] ?? []} />
      ))}
    </div>
  )
}

function CommentComposer({ cardId, parentId, onDone, autoFocus, placeholder = 'Write a comment...', quoteName }: {
  cardId: string
  parentId?: string
  onDone?: () => void
  autoFocus?: boolean
  placeholder?: string
  // Threads stay one level deep — every reply's parent is the root comment, not
  // the reply it answers, so the conversation never has to be reassembled from
  // a tree nobody can see past two levels. Replying to a reply instead opens
  // starting with that person's name, the same @[Full Name] mentions already
  // render as a pill, so who it was aimed at survives being flattened.
  quoteName?: string
}) {
  const { user } = useAuth()
  const { data: users = [] } = useUsers()
  const addComment = useAddComment()
  const uploadAttachment = useUploadAttachment()
  const linkAttachments = useLinkAttachmentsToComment()
  const toast = useToast()
  const [body, setBody] = useState(quoteName ? `@[${quoteName}] ` : '')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // @mention autocomplete: tracks the "@query" fragment being typed and
  // where it starts in `body`, so a pick can replace just that fragment.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  // Autofocus puts the cursor at position 0 by default, which would land it
  // before the quoted @[Name] rather than where typing actually continues.
  useEffect(() => {
    if (autoFocus && quoteName) {
      const pos = textareaRef.current?.value.length ?? 0
      textareaRef.current?.setSelectionRange(pos, pos)
    }
    // Only on mount: this composer instance never changes its quoted target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const mentionMatches = mentionQuery === null ? [] : users
    .filter(u => u.id !== user?.id && u.full_name.toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 6)

  function addFiles(incoming: File[]) {
    const invalid = incoming.filter(f => !ACCEPTED.includes(f.type))
    if (invalid.length) toast(`${invalid.length} unsupported file(s) skipped`, 'error')
    const supported = incoming.filter(f => ACCEPTED.includes(f.type))
    const tooBig = supported.filter(f => f.size > MAX_SIZE)
    for (const f of tooBig) {
      toast(`"${f.name}" is ${formatFileSize(f.size)} — the limit is ${formatFileSize(MAX_SIZE)}`, 'error')
    }
    setFiles(prev => [...prev, ...supported.filter(f => f.size <= MAX_SIZE)])
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setBody(value)
    const cursor = e.target.selectionStart
    const match = value.slice(0, cursor).match(/(?:^|\s)@([^\s@]{0,40})$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionStart(cursor - match[1].length - 1)
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionStart(null)
    }
  }

  function pickMention(target: User) {
    if (mentionStart === null) return
    const cursor = textareaRef.current?.selectionStart ?? body.length
    const before = body.slice(0, mentionStart)
    const after = body.slice(cursor)
    const insertion = `@[${target.full_name}] `
    setBody(before + insertion + after)
    setMentionQuery(null)
    setMentionStart(null)
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionMatches[mentionIndex]); return }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() && files.length === 0) return
    setSubmitting(true)
    try {
      // Upload files first
      const uploadedNames: string[] = []
      const uploadedIds: string[] = []
      for (const file of files) {
        const attachment = await uploadAttachment.mutateAsync({ cardId, file })
        uploadedNames.push(file.name)
        uploadedIds.push(attachment.id)
      }

      // Build comment body — append file refs if any
      let finalBody = body.trim()
      if (uploadedNames.length > 0) {
        const suffix = uploadedNames.map(n => `📎 ${n}`).join('\n')
        finalBody = finalBody ? `${finalBody}\n\n${suffix}` : suffix
      }

      const mentionedUserIds = [...finalBody.matchAll(MENTION_PATTERN)]
        .map(m => users.find(u => u.full_name === m[1])?.id)
        .filter((id): id is string => !!id)

      const { comment } = await addComment.mutateAsync({ cardId, body: finalBody, parentId, mentionedUserIds })
      if (uploadedIds.length > 0) {
        await linkAttachments.mutateAsync({ attachmentIds: uploadedIds, commentId: comment.id, cardId })
      }
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
          className={cn('relative rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring transition-colors', files.length > 0 && 'border-primary/40')}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
        >
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
            placeholder={placeholder}
            rows={parentId ? 2 : 3}
            className="border-0 shadow-none focus-visible:ring-0 resize-none rounded-b-none"
            autoFocus={autoFocus}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          />

          {mentionMatches.length > 0 && (
            <div className="absolute left-2 bottom-full mb-1 w-56 bg-popover border border-border rounded-md shadow-lg py-1 z-10 max-h-48 overflow-y-auto">
              {mentionMatches.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickMention(u) }}
                  className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm', i === mentionIndex ? 'bg-accent' : 'hover:bg-accent')}
                >
                  <Avatar name={u.full_name} imageUrl={u.avatar_url} size="sm" />
                  <span className="truncate">{u.full_name}</span>
                </button>
              ))}
            </div>
          )}

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
  // Which comment the open composer is answering — the root, or one of its
  // replies. Either way the post goes in flat, parented to the root: see the
  // note on CommentComposer's quoteName for why.
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null)

  function reply(target: Comment) {
    setReplyTarget(target)
  }

  return (
    // A top-level comment plus its replies is one exchange, so each one closes
    // with a rule — otherwise consecutive threads read as a single conversation.
    <div className="pb-5 border-b border-border last:border-b-0 last:pb-0">
      <CommentBody comment={comment} cardId={cardId} isOwn={comment.user_id === user?.id} />

      <div className="ml-11 mt-1.5">
        {replyTarget?.id !== comment.id && (
          <button onClick={() => reply(comment)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 -ml-2 rounded hover:bg-accent">
            <Reply className="h-3 w-3" />Reply
          </button>
        )}
      </div>

      {replies.length > 0 && (
        <div className="ml-11 mt-3 space-y-4 border-l-2 border-border pl-4">
          {replies.map(r => (
            <div key={r.id}>
              <CommentBody comment={r} cardId={cardId} isOwn={r.user_id === user?.id} />
              {replyTarget?.id !== r.id && (
                <button onClick={() => reply(r)}
                  className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 -ml-2 rounded hover:bg-accent">
                  <Reply className="h-3 w-3" />Reply
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {replyTarget && (
        <div className="ml-11 mt-3">
          <CommentComposer
            cardId={cardId}
            parentId={comment.id}
            autoFocus
            placeholder={`Reply to ${replyTarget.user?.full_name ?? 'comment'}...`}
            quoteName={replyTarget.id === comment.id ? undefined : replyTarget.user?.full_name}
            onDone={() => setReplyTarget(null)}
          />
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
  const { data: attachments = [] } = useAttachments(cardId)
  const [preview, setPreview] = useState<{ url: string; filename: string; isImage: boolean } | null>(null)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)

  const linkedAttachments = attachments.filter(a => a.comment_id === comment.id)

  // Prefer the id-based link (robust to renames/duplicates); fall back to
  // filename matching for comments posted before that link existed.
  function findAttachment(filename: string) {
    return linkedAttachments.find(a => a.filename === filename) ?? attachments.find(a => a.filename === filename)
  }

  async function handleAttachmentClick(filename: string) {
    const match = findAttachment(filename)
    if (!match) { toast('File not found here — check the Files tab', 'error'); return }
    setLoadingFile(filename)
    try {
      const url = await getSignedUrl(match.file_url)
      setPreview({ url, filename, isImage: match.file_type.startsWith('image/') })
    } catch { toast('Failed to load preview', 'error') }
    finally { setLoadingFile(null) }
  }

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

  // A lista é curta e vem em cache; serve só para trocar o id do fornecedor
  // pelo nome dele no crachá.
  const { data: suppliers = [] } = useSuppliers()
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
            {/* Era "DEQI" fixo, de quando havia um fornecedor só — o que fazia
                um comentário do Carlos aparecer assinado com o nome do outro
                fornecedor. Agora sai o nome de quem realmente escreveu. */}
            {author.role === 'viewer'
              ? (suppliers.find(s => s.id === author.supplier_id)?.short_name ?? 'Supplier')
              : 'Redantex'}
          </span>
          <span className="text-xs text-muted-foreground" title={formatRelative(comment.created_at)}>
            {formatDateTime(comment.created_at)}
          </span>
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
            {textBody && <p className="text-sm whitespace-pre-wrap leading-relaxed">{renderWithMentions(textBody)}</p>}

            {/* Attachment badges */}
            {attachmentLines.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attachmentLines.map((line, i) => {
                  const filename = line.replace('📎 ', '')
                  const isLoading = loadingFile === filename
                  // The chip and the Files tab point at one file, so approval
                  // shows here too rather than only where it was granted.
                  const found = findAttachment(filename)
                  const approved = !!found?.approved_at
                  // A sample's verdict belongs where the file was handed over,
                  // not only in the Files tab nobody scrolls to.
                  const review = found?.kind ? { kind: found.kind, status: found.review_status ?? 'pending' } : null
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleAttachmentClick(filename)}
                      disabled={isLoading}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs border transition-colors',
                        approved
                          ? 'bg-green-50 hover:bg-green-100 border-green-300 text-green-900'
                          : 'bg-muted hover:bg-accent border-border'
                      )}
                    >
                      {isLoading
                        ? <div className="h-3 w-3 border border-muted-foreground border-t-transparent rounded-full animate-spin shrink-0" />
                        : approved
                          ? <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                          : <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                      <span className="font-medium truncate max-w-[180px]">{filename}</span>
                      {approved && (
                        <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">✓ APPROVED</span>
                      )}
                      {review && (
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                          review.status === 'approved' ? 'text-green-700 bg-green-100'
                            : review.status === 'rejected' ? 'text-red-700 bg-red-100'
                            : review.kind === 'pi' ? 'text-purple-700 bg-purple-100'
                            : 'text-blue-700 bg-blue-100')}>
                          {(review.kind === 'pi' ? 'PI' : 'SAMPLE')}
                          {review.status === 'approved' ? ' ✓' : review.status === 'rejected' ? ' ✗' : ''}
                        </span>
                      )}
                      <span className={cn('text-[10px]', approved ? 'text-green-700' : 'text-muted-foreground')}>→ Preview</span>
                    </button>
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

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setPreview(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setPreview(null)}><X className="h-6 w-6" /></button>
          {preview.isImage ? (
            <img src={preview.url} alt={preview.filename} className="max-h-[90vh] max-w-[90vw] object-contain rounded" onClick={e => e.stopPropagation()} />
          ) : (
            <div className="bg-white rounded-lg w-[90vw] h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-2 border-b border-border flex items-center justify-between shrink-0">
                <p className="text-sm font-medium truncate">{preview.filename}</p>
                <a href={preview.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline shrink-0 ml-2">Open in new tab</a>
              </div>
              <iframe src={preview.url} title={preview.filename} className="flex-1 w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function renderWithMentions(text: string) {
  const parts = text.split(MENTION_PATTERN)
  // String.split with a capturing regex interleaves [text, name, text, name, ...text]
  return parts.map((part, i) =>
    i % 2 === 1
      ? <span key={i} className="font-medium text-primary bg-primary/10 rounded px-1">@{part}</span>
      : <Fragment key={i}>{part}</Fragment>
  )
}
