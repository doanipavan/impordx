import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MessageSquare, Paperclip, AlertCircle, Calendar, Clock, CalendarClock } from 'lucide-react'
import { Card, PRIORITY_COLORS, STATUS_COLORS, salespersonLabel } from '../../types'
import { Avatar } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { cn, formatDate, isOverdue, isDueSoon, dueDateFor, cardAge, sampleSla, deliverySlip } from '../../lib/utils'

interface KanbanCardProps {
  card: Card
  onClick: () => void
  isDragging?: boolean
}

const PRIORITY_FLAGS: Record<string, string> = {
  urgent: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '',
}

export function KanbanCard({ card, onClick, isDragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({
    id: card.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // On an order the live date is the delivery date, not the sample's deadline.
  const age = cardAge(card.created_at, card.shipped_at)
  const sla = sampleSla(card)
  const dueDate = dueDateFor(card)
  const overdue = isOverdue(dueDate)
  const dueSoon = !overdue && isDueSoon(dueDate)
  // A moved delivery date has to be visible from the board. Finding out only
  // by opening the card is how a slip goes unnoticed for a week.
  const slip = deliverySlip(card)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'group relative bg-card rounded-lg border border-border p-3 shadow-card cursor-pointer select-none',
        'hover:shadow-card-hover hover:border-border/80 transition-all duration-150',
        isDragging || isSortDragging ? 'opacity-40 shadow-modal rotate-1' : '',
        overdue && 'border-l-2 border-l-red-400',
        sla?.state === 'breached' && 'border-l-2 border-l-red-500',
        slip && 'border-l-2 border-l-red-500'
      )}
    >
      {/* Priority + Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[card.status])}>
          {card.status}
        </span>
        {card.priority !== 'low' && (
          <span className={cn('text-xs font-medium', PRIORITY_COLORS[card.priority])}>
            {PRIORITY_FLAGS[card.priority]} {card.priority}
          </span>
        )}
      </div>

      {/* The slip sits above the title, not in the footer with the counts: it
          is the reason to open this card, so it should be read before the name. */}
      {slip && (
        <div className="flex items-center gap-1.5 mb-2 rounded-md bg-red-50 border border-red-200 px-2 py-1"
          title={slip.reason
            ? `Promised ${formatDate(slip.promised)} — ${slip.reason}`
            : `Promised ${formatDate(slip.promised)}`}>
          <CalendarClock className="h-3 w-3 text-red-600 shrink-0" />
          <span className="text-[10px] font-bold text-red-800 tabular-nums">
            {slip.days > 0 ? `+${slip.days}d` : `${slip.days}d`}
          </span>
          <span className="text-[10px] text-red-700 truncate">
            was {formatDate(slip.promised)}
          </span>
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium text-foreground line-clamp-2 mb-2 leading-snug">{card.title}</p>

      {/* Ref number */}
      {card.ref_number && (
        <p className="text-[10px] font-mono text-muted-foreground/70 mb-1">{card.ref_number}</p>
      )}

      {/* Client / Collection */}
      {(card.client_name || card.collection) && (
        <div className="flex items-center gap-1.5 mb-2">
          {card.collection && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{card.collection}</Badge>
          )}
          {card.client_name && (
            <span className="text-xs text-muted-foreground truncate">{card.client_name}</span>
          )}
        </div>
      )}

      {/* Value */}
      {card.value_usd && (
        <p className="text-xs text-green-600 font-medium mb-2">
          ${card.value_usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
        <div className="flex items-center gap-2">
          {(card.comments_count ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {card.comments_count}
            </span>
          )}
          {(card.attachments_count ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              {card.attachments_count}
            </span>
          )}
          {/* Always on, so the pace is readable before it becomes a problem —
              quiet while there is room, loud only when there is not. */}
          {sla && (
            <span className={cn('flex items-center gap-1 text-xs tabular-nums',
              sla.state === 'breached' ? 'text-red-600 font-semibold'
                : sla.state === 'due' ? 'text-amber-600 font-semibold'
                : 'text-muted-foreground')}
              title={sla.state === 'breached'
                ? `${sla.used} business days in ${card.status} — SLA is ${sla.limit}`
                : `Business day ${sla.used} of ${sla.limit} in ${card.status}`}>
              {sla.state === 'ok'
                ? <Clock className="h-3 w-3" />
                : <AlertCircle className="h-3 w-3" />}
              {sla.used}/{sla.limit}
            </span>
          )}
          {age && (
            <span className={cn('flex items-center gap-1 text-xs tabular-nums',
              age.done ? 'text-green-600' : 'text-muted-foreground')}
              title={age.done
                ? `Shipped ${age.days} days after it was opened`
                : `Open for ${age.days} days`}>
              <Clock className="h-3 w-3" />
              {age.days}d
            </span>
          )}
          {dueDate && (
            <span className={cn(
              'flex items-center gap-1 text-xs',
              overdue ? 'text-red-500 font-medium' : dueSoon ? 'text-amber-500' : 'text-muted-foreground'
            )}>
              {overdue && <AlertCircle className="h-3 w-3" />}
              {!overdue && <Calendar className="h-3 w-3" />}
              {formatDate(dueDate)}
            </span>
          )}
        </div>

        {/* Project manager leads — they are the one accountable for it moving. */}
        {(card.project_manager || salespersonLabel(card)) && (
          <div className="flex items-center -space-x-1.5">
            {card.project_manager && (
              <Avatar name={card.project_manager.full_name} imageUrl={card.project_manager.avatar_url}
                size="xs" className="ring-1 ring-card" />
            )}
            {salespersonLabel(card) && card.salesperson?.id !== card.project_manager?.id && (
              <Avatar name={salespersonLabel(card)!} imageUrl={card.salesperson?.avatar_url}
                size="xs" className="ring-1 ring-card opacity-70" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
