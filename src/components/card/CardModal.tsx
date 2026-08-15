import { useState } from 'react'
import { X, Trash2, Copy, Calendar, DollarSign, Package, Layers, Paintbrush, Tag } from 'lucide-react'
import { Card, BoardType, BOARD_COLUMNS, CardStatus, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '../../types'
import { useUpdateCard, useMoveCard, useDeleteCard, useCreateCard } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Avatar } from '../ui/avatar'
import { Select } from '../ui/select'
import { Separator } from '../ui/label'
import { CommentThread } from '../comments/CommentThread'
import { AttachmentPanel } from '../attachments/AttachmentPanel'
import { ActivityLog } from './ActivityLog'
import { LineItemsTable } from './LineItemsTable'
import { OrderFulfilment } from './OrderFulfilment'
import { EditCardModal } from './EditCardModal'
import { SeenBy } from './SeenBy'
import { useRecordView } from '../../hooks/useCardViews'
import { cn, formatDate, formatCurrency, isOverdue } from '../../lib/utils'

interface CardModalProps {
  card: Card
  board: BoardType
  onClose: () => void
}

type Tab = 'details' | 'comments' | 'attachments' | 'history'

export function CardModal({ card, board, onClose }: CardModalProps) {
  const [tab, setTab] = useState<Tab>('details')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const moveCard = useMoveCard()
  const deleteCard = useDeleteCard()
  const createCard = useCreateCard()
  const { user } = useAuth()
  const toast = useToast()
  useRecordView(card.id) // record that this user viewed the card
  const columns = BOARD_COLUMNS[board]
  const overdue = isOverdue(card.deadline)

  async function handleDelete() {
    try {
      await deleteCard.mutateAsync({ id: card.id, board })
      toast('Card deleted', 'info')
      onClose()
    } catch {
      toast('Failed to delete card', 'error')
    }
  }

  async function handleDuplicate() {
    try {
      await createCard.mutateAsync({
        board,
        status: card.status,
        title: card.title + ' (copy)',
        priority: card.priority,
        client_name: card.client_name,
        collection: card.collection,
        quantity: card.quantity,
        value_usd: card.value_usd,
        deadline: card.deadline,
        description: card.description,
        outside_material: card.outside_material,
        inside_material: card.inside_material,
        logo_color: card.logo_color,
        logo_technique: card.logo_technique,
        logo_technique_outside: card.logo_technique_outside,
        logo_technique_inside: card.logo_technique_inside,
        logo_text_outside: card.logo_text_outside,
        logo_text_inside: card.logo_text_inside,
        logo_color_outside: card.logo_color_outside,
        logo_color_inside: card.logo_color_inside,
        reference_code: card.reference_code,
        supplier_ref: card.supplier_ref,
      })
      toast('Card duplicated', 'success')
      onClose()
    } catch {
      toast('Failed to duplicate card', 'error')
    }
  }

  async function handleArchive() {
    try {
      const { supabase: sb } = await import('../../lib/supabase')
      const uid = (await sb.auth.getUser()).data.user?.id ?? ''
      const { error } = await sb.from('cards').update({ archived: true }).eq('id', card.id)
      if (error) throw error
      await sb.from('activity_logs').insert({ card_id: card.id, user_id: uid, action: 'archived' })
      toast('Card archived', 'info')
      onClose()
    } catch {
      toast('Failed to archive card', 'error')
    }
  }

  async function handleStatusChange(newStatus: string) {
    try {
      await moveCard.mutateAsync({ id: card.id, status: newStatus as CardStatus, board })
      toast(`Moved to "${newStatus}"`, 'success')
    } catch {
      toast('Failed to update status', 'error')
    }
  }

  function handleCopyLink() {
    const ref = card.ref_number ?? card.id
    const url = `${window.location.origin}/${card.board}/${ref}`
    navigator.clipboard.writeText(url).then(() => toast('Link copied — share it to open this card directly', 'success'))
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'comments', label: `Comments${(card.comments_count ?? 0) > 0 ? ` (${card.comments_count})` : ''}` },
    { key: 'attachments', label: `Files${(card.attachments_count ?? 0) > 0 ? ` (${card.attachments_count})` : ''}` },
    { key: 'history', label: 'History' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] bg-card rounded-xl shadow-modal border border-border flex flex-col animate-slide-up">

        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[card.status])}>
                {card.status}
              </span>
              <span className={cn('text-xs font-medium', PRIORITY_COLORS[card.priority])}>
                {PRIORITY_LABELS[card.priority]}
              </span>
              {card.ref_number && (
                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {card.ref_number}
                </span>
              )}
              {overdue && <Badge variant="destructive">Overdue</Badge>}
            </div>
            <h2 className="text-lg font-semibold leading-snug">{card.title}</h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)} title="Edit card">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </Button>
            {user?.role !== 'viewer' && (
              <Button variant="ghost" size="icon" onClick={handleArchive} title="Archive card" className="text-muted-foreground hover:text-amber-600">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleDuplicate} title="Duplicate card">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCopyLink} title="Copy link">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </Button>
            {/* Delete gets its own group: it used to sit flush between Copy link
                and Close, at the same weight, so reaching for Close could hit it. */}
            {user?.role === 'admin' && (
              <div className="flex items-center ml-1 pl-1 border-l border-border">
                {!confirmDelete ? (
                  <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} title="Delete card"
                    className="hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-1 bg-destructive/10 rounded-md px-2 py-1">
                    <span className="text-xs text-destructive font-medium">Delete?</span>
                    <Button size="sm" variant="destructive" onClick={handleDelete} loading={deleteCard.isPending}>Yes</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center ml-1 pl-1 border-l border-border">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-border shrink-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {tab === 'details' && (
            <div className="grid md:grid-cols-3 gap-0 h-full">
              {/* Main */}
              <div className="md:col-span-2 p-6 space-y-5 border-r border-border">

                {/* On an order, the PI and the delivery date are the first thing
                    anyone opens the card to check, so they lead. */}
                {card.board === 'orders' && <OrderFulfilment card={card} />}

                {/* Status change */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Move to status</p>
                  <div className="flex gap-2 flex-wrap">
                    {columns.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        disabled={s === card.status}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-full font-medium border transition-all',
                          s === card.status
                            ? cn('border-transparent', STATUS_COLORS[s])
                            : 'border-border text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Description */}
                {card.description && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Description</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{card.description}</p>
                  </div>
                )}

                {/* Product specs */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Product Specifications</p>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField icon={<Layers />} label="Collection" value={card.collection} />
                    <InfoField icon={<Package />} label="Quantity" value={card.quantity ? `${card.quantity} pcs` : undefined} />
                    <InfoField icon={<Tag />} label="Size" value={card.size} />
                    <InfoField icon={<DollarSign />} label="Value (USD)" value={card.value_usd ? formatCurrency(card.value_usd) : undefined} />
                  </div>
                </div>

                {/* Materials */}
                {(card.outside_material || card.inside_material) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Materials & Finish</p>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoField icon={<Paintbrush />} label="Outside" value={card.outside_material} />
                      <InfoField icon={<Paintbrush />} label="Inside" value={card.inside_material} />
                    </div>
                  </div>
                )}

                {/* Logo */}
                {(card.logo_technique_outside || card.logo_technique_inside) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Logo</p>
                    <div className="space-y-2">
                      {(card.logo_technique_outside || card.logo_text_outside || card.logo_color_outside) && (
                        <div className="rounded-md bg-muted/40 p-2.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Outside</p>
                          <div className="grid grid-cols-3 gap-2">
                            <InfoField label="Technique" value={card.logo_technique_outside} />
                            <InfoField label="Text" value={card.logo_text_outside} />
                            <InfoField label="Color" value={card.logo_color_outside} />
                          </div>
                        </div>
                      )}
                      {(card.logo_technique_inside || card.logo_text_inside || card.logo_color_inside) && (
                        <div className="rounded-md bg-muted/40 p-2.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Inside</p>
                          <div className="grid grid-cols-3 gap-2">
                            <InfoField label="Technique" value={card.logo_technique_inside} />
                            <InfoField label="Text" value={card.logo_text_inside} />
                            <InfoField label="Color" value={card.logo_color_inside} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* References */}
                {(card.reference_code || card.supplier_ref) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">References</p>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoField label="RDX Code" value={card.reference_code} monospace />
                      <InfoField label="DEQI Ref" value={card.supplier_ref} monospace />
                    </div>
                  </div>
                )}

                {/* Line Items */}
                <div className="pt-2">
                  <LineItemsTable card={card} />
                </div>

              </div>

              {/* Sidebar */}
              <div className="p-5 space-y-4">
                {/* Seen by */}
                <div>
                  <SeenBy cardId={card.id} />
                </div>

                {/* Approved artwork */}

                {card.responsible && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">Owner</p>
                    <div className="flex items-center gap-2">
                      <Avatar name={card.responsible.full_name} imageUrl={card.responsible.avatar_url} size="sm" />
                      <span className="text-sm">{card.responsible.full_name}</span>
                    </div>
                  </div>
                )}

                {/* Client */}
                {card.client_name && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Client</p>
                    <p className="text-sm font-medium">{card.client_name}</p>
                  </div>
                )}

                {/* Dates */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">Dates</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Created: {formatDate(card.created_at)}</span>
                    </div>
                    {card.deadline && (
                      <div className={cn('flex items-center gap-2 text-xs', overdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                        <Calendar className="h-3 w-3" />
                        <span>Deadline: {formatDate(card.deadline)}</span>
                        {overdue && <Badge variant="destructive">Overdue</Badge>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tags */}
                {card.tags && card.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {card.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'comments' && (
            <div className="p-6">
              <CommentThread cardId={card.id} />
            </div>
          )}

          {tab === 'attachments' && (
            <div className="p-6">
              <AttachmentPanel cardId={card.id} />
            </div>
          )}

          {tab === 'history' && (
            <div className="p-6">
              <ActivityLog cardId={card.id} />
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditCardModal card={card} board={board} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

function InfoField({
  label,
  value,
  icon,
  monospace,
}: {
  label: string
  value?: string | null
  icon?: React.ReactNode
  monospace?: boolean
}) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-sm font-medium', monospace && 'font-mono')}>{value}</p>
    </div>
  )
}
