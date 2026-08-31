import { Clock, ArrowRight, Plus, Trash2, Upload, MessageSquare } from 'lucide-react'
import { useActivityLog } from '../../hooks/useActivityLog'
import { Avatar } from '../ui/avatar'
import { formatRelative, formatWeekdayDateTime } from '../../lib/utils'

const ACTION_CONFIG: Record<string, { label: (e: { old_value?: string; new_value?: string }) => string; icon: typeof Clock; color: string }> = {
  created:          { label: () => 'created this card', icon: Plus, color: 'text-green-600' },
  moved:            { label: (e) => `moved to "${e.new_value}"`, icon: ArrowRight, color: 'text-blue-600' },
  updated:          { label: () => 'edited card details', icon: Clock, color: 'text-amber-600' },
  archived:         { label: () => 'archived this card', icon: Clock, color: 'text-slate-500' },
  deleted:          { label: () => 'deleted this card', icon: Trash2, color: 'text-red-500' },
  uploaded:         { label: (e) => `uploaded "${e.new_value ?? 'a file'}"`, icon: Upload, color: 'text-purple-600' },
  commented:        { label: () => 'posted a comment', icon: MessageSquare, color: 'text-slate-500' },
  generated_order:  { label: (e) => `generated order ${e.new_value ?? ''}`, icon: ArrowRight, color: 'text-green-700' },
}

export function ActivityLog({ cardId }: { cardId: string }) {
  const { data: logs = [], isLoading } = useActivityLog(cardId)

  if (isLoading) return <p className="text-sm text-muted-foreground py-4 text-center">Loading history...</p>

  if (logs.length === 0) return (
    <div className="text-center py-8 text-muted-foreground">
      <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No activity yet.</p>
    </div>
  )

  return (
    <div className="space-y-1">
      {logs.map((entry) => {
        const config = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG['updated']
        const Icon = config.icon
        const name = entry.user?.full_name ?? 'Unknown'

        return (
          <div key={entry.id} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
            <div className="relative shrink-0 mt-0.5">
              <Avatar name={name} imageUrl={entry.user?.avatar_url} size="sm" />
              <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-white flex items-center justify-center ring-1 ring-border`}>
                <Icon className={`h-2.5 w-2.5 ${config.color}`} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-semibold">{name}</span>{' '}
                <span className="text-muted-foreground">{config.label(entry)}</span>
              </p>
              {/* The date leads now — "7 days ago" answers how long, not which
                  day, and reopening a card after a week is exactly when the
                  actual date is what's needed. The countdown moves to the
                  hover instead of disappearing. */}
              <p className="text-xs text-muted-foreground mt-0.5" title={formatRelative(entry.created_at)}>
                {formatWeekdayDateTime(entry.created_at)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
