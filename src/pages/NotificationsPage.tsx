import { useNavigate } from 'react-router-dom'
import { Bell, Check, ArrowLeft, ChevronRight } from 'lucide-react'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '../hooks/useNotifications'
import { Button } from '../components/ui/button'
import { Avatar } from '../components/ui/avatar'
import { cn, formatRelative } from '../lib/utils'

export function NotificationsPage() {
  const navigate = useNavigate()
  const { data: notifications = [], isLoading } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllRead()
  const unread = notifications.filter(n => !n.read)

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Notifications</h1>
            {unread.length > 0 && <p className="text-sm text-muted-foreground mt-0.5">{unread.length} unread</p>}
          </div>
          {unread.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} loading={markAllRead.isPending}>
              <Check className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Info box */}
        <div className="rounded-lg bg-muted/50 border border-border p-4 mb-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How notifications work</p>
          <ul className="space-y-1 text-xs list-disc list-inside">
            <li>Someone @mentions you in a comment</li>
            <li>Someone comments on a card you opened, own, or have replied to</li>
          </ul>
          <p className="text-xs mt-2 text-muted-foreground/70">Click a notification to open the card it refers to.</p>
        </div>

        {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

        {!isLoading && notifications.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">All caught up</p>
            <p className="text-sm mt-1">No notifications yet.</p>
          </div>
        )}

        <div className="space-y-2">
          {notifications.map(n => {
            // The card route resolves by ref_number. A deleted card leaves the
            // notification behind with card_id nulled, so there is nowhere to go.
            const target = n.card?.ref_number ? `/${n.card.board}/${n.card.ref_number}` : null

            function open() {
              if (!n.read) markRead.mutate(n.id)
              if (target) navigate(target)
            }

            return (
            <div key={n.id} onClick={open} role={target ? 'link' : undefined}
              tabIndex={target ? 0 : undefined}
              onKeyDown={e => { if (target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open() } }}
              className={cn('flex items-start gap-3 p-4 rounded-lg border transition-all',
                target ? 'cursor-pointer hover:border-primary/40 hover:shadow-card-hover' : 'cursor-default',
                n.read ? 'bg-card border-border opacity-70' : 'bg-card border-border border-l-2 border-l-primary shadow-card')}>
              {n.actor ? (
                <Avatar name={n.actor.full_name} imageUrl={n.actor.avatar_url} size="sm" className="shrink-0 mt-0.5" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm">{n.message}</p>
                {n.card && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {n.card.ref_number && <span className="font-mono">{n.card.ref_number} · </span>}
                    {n.card.title}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatRelative(n.created_at)}
                  {!target && <span className="ml-1.5 italic">· card no longer available</span>}
                </p>
              </div>
              {target && <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />}
              {!n.read && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
