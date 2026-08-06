import { useState } from 'react'
import { Edit2, Trash2, Check, X, MessageSquare } from 'lucide-react'
import { useComments, useAddComment, useEditComment, useDeleteComment } from '../../hooks/useComments'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { formatRelative, cn } from '../../lib/utils'
import { Comment } from '../../types'

export function CommentThread({ cardId }: { cardId: string }) {
  const { data: comments = [], isLoading } = useComments(cardId)
  const { user } = useAuth()
  const addComment = useAddComment()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSubmitting(true)
    try {
      await addComment.mutateAsync({ cardId, body: text })
      setBody('')
    } catch {
      toast('Failed to post comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Loading comments...</div>

  return (
    <div className="space-y-5">
      {/* Comment list */}
      {comments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No comments yet. Start the conversation.</p>
        </div>
      )}

      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          cardId={cardId}
          isOwn={comment.user_id === user?.id}
        />
      ))}

      {/* New comment form */}
      {user && (
        <form onSubmit={handleSubmit} className="flex gap-3 pt-2">
          <Avatar name={user.full_name} imageUrl={user.avatar_url} size="sm" className="shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e)
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Ctrl+Enter to submit</p>
              <Button type="submit" size="sm" loading={submitting} disabled={!body.trim()}>
                Post comment
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

function CommentItem({ comment, cardId, isOwn }: { comment: Comment; cardId: string; isOwn: boolean }) {
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
    } catch {
      toast('Failed to update comment', 'error')
    }
  }

  async function handleDelete() {
    try {
      await deleteComment.mutateAsync({ id: comment.id, cardId })
    } catch {
      toast('Failed to delete comment', 'error')
    }
  }

  const author = comment.user
  if (!author) return null

  return (
    <div className="flex gap-3 group">
      <Avatar name={author.full_name} imageUrl={author.avatar_url} size="sm" className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">{author.full_name}</span>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded font-medium',
            author.role === 'admin' || author.role === 'member'
              ? 'bg-primary/10 text-primary'
              : 'bg-amber-50 text-amber-700'
          )}>
            {author.role === 'admin' || author.role === 'member' ? 'Redantex' : 'DEQI'}
          </span>
          <span className="text-xs text-muted-foreground">{formatRelative(comment.created_at)}</span>
          {comment.edited && <span className="text-xs text-muted-foreground italic">(edited)</span>}
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              className="resize-none text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEdit} loading={editComment.isPending}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditBody(comment.body) }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{comment.body}</p>

            {isOwn && (
              <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setEditing(true); setEditBody(comment.body) }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-accent"
                >
                  <Edit2 className="h-3 w-3" />Edit
                </button>
                {!confirming ? (
                  <button
                    onClick={() => setConfirming(true)}
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1 rounded hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-destructive font-medium">Delete?</span>
                    <button onClick={handleDelete} className="px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => setConfirming(false)} className="px-2 py-1 rounded hover:bg-accent">
                      <X className="h-3 w-3" />
                    </button>
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
