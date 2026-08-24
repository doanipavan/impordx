import { Eye } from 'lucide-react'
import { Card } from '../../types'
import { Avatar } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { useCardViews } from '../../hooks/useCardViews'
import { useAttachments } from '../../hooks/useAttachments'
import { cn, formatDate, formatDateTime, cardAge, isOverdue, dueDateFor } from '../../lib/utils'
import { salespersonLabel } from '../../types'

// Client, owners and dates used to occupy a third of the card in a column of
// their own. They are four short facts, so they ride in one line above the tabs
// and give the whole width back to the line items.

function Field({ label, children, title }: {
  label: string
  children: React.ReactNode
  title?: string
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0" title={title}>
      <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground/70 whitespace-nowrap">
        {label}
      </span>
      {children}
    </div>
  )
}

function Sep() {
  return <span className="w-px h-4 bg-border shrink-0" aria-hidden="true" />
}

export function CardMetaStrip({ card }: { card: Card }) {
  const { data: views = [] } = useCardViews(card.id)
  const { data: attachments = [] } = useAttachments(card.id)

  const age = cardAge(card.created_at, card.shipped_at)
  const overdue = isOverdue(dueDateFor(card))
  const sales = salespersonLabel(card)
  const pm = card.project_manager

  // The trigger also stamps order_confirmed_at for a card dragged straight past
  // PI Approved, so the attachment's own review is the only proof the PI was
  // actually approved by someone. Fall back to the stamp, labelled differently.
  const piApproval = attachments.find(a => a.kind === 'pi' && a.review_status === 'approved')
  const piDate = piApproval?.reviewed_at ?? null
  const confirmedDate = card.order_confirmed_at ?? null

  const seen = views[0]
  const deqiSeen = views.some(v => v.user?.role === 'viewer')

  return (
    <div className="px-6 py-2 border-t border-border/60 bg-muted/30 flex items-center gap-x-4 gap-y-1.5 flex-wrap shrink-0">

      {card.client_name && (
        <>
          <Field label="Client">
            <span className="text-xs font-semibold truncate max-w-[180px]">{card.client_name}</span>
          </Field>
          <Sep />
        </>
      )}

      {(sales || pm) && (
        <>
          {/* Overlapped avatars keep two people in the width of roughly one. */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex items-center shrink-0">
              {sales && (
                <span title={`Sales — ${sales}`} className="flex">
                  <Avatar name={sales} imageUrl={card.salesperson?.avatar_url} size="xs" />
                </span>
              )}
              {pm && (
                <span title={`Project — ${pm.full_name}`}
                  className={cn('flex ring-2 ring-background rounded-full', sales && '-ml-1.5')}>
                  <Avatar name={pm.full_name} imageUrl={pm.avatar_url} size="xs" />
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[190px]">
              {[sales, pm?.full_name].filter(Boolean).join(' · ')}
            </span>
          </div>
          <Sep />
        </>
      )}

      {/* The commercial commitment: the day the 60 days actually started. */}
      {piDate ? (
        <>
          <Field label="PI approved" title={`Approved ${formatDateTime(piDate)}`}>
            <span className="text-xs font-semibold text-green-700">{formatDate(piDate)}</span>
          </Field>
          <Sep />
        </>
      ) : confirmedDate ? (
        <>
          <Field label="Confirmed" title="Stamped when the order passed PI Approved">
            <span className="text-xs font-semibold">{formatDate(confirmedDate)}</span>
          </Field>
          <Sep />
        </>
      ) : null}

      {age && (
        <>
          <Field label={age.done ? 'Shipped after' : 'Open'}>
            <span className={cn('text-xs font-semibold tabular-nums',
              age.done && 'text-green-700')}>
              {age.days} d
            </span>
          </Field>
          <Sep />
        </>
      )}

      {card.deadline && (
        <Field label={card.board === 'orders' ? 'Orig. deadline' : 'Deadline'}>
          <span className={cn('text-xs font-semibold',
            overdue && card.board !== 'orders' && 'text-destructive')}>
            {formatDate(card.deadline)}
          </span>
          {overdue && card.board !== 'orders' && (
            <Badge variant="destructive" className="ml-1">Overdue</Badge>
          )}
        </Field>
      )}

      {card.tags && card.tags.length > 0 && (
        <>
          <Sep />
          <div className="flex items-center gap-1 flex-wrap">
            {card.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          </div>
        </>
      )}

      {/* Who has looked at the card, pushed to the far end. */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {seen ? (
          <div className="flex items-center gap-1.5"
            title={`Last seen by ${seen.user?.full_name} — ${formatDateTime(seen.viewed_at)}`}>
            <Eye className="h-3.5 w-3.5 text-muted-foreground/70" />
            <Avatar name={seen.user?.full_name ?? '?'} imageUrl={seen.user?.avatar_url} size="xs" />
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <Eye className="h-3.5 w-3.5" /> Not seen yet
          </span>
        )}
        {!deqiSeen && (
          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 whitespace-nowrap"
            title="DEQI hasn't opened this card yet">
            DEQI not opened
          </span>
        )}
      </div>
    </div>
  )
}
