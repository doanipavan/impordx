import { Eye } from 'lucide-react'
import { useCardViews } from '../../hooks/useCardViews'
import { Avatar } from '../ui/avatar'
import { formatRelative, cn } from '../../lib/utils'

export function SeenBy({ cardId }: { cardId: string }) {
  const { data: views = [] } = useCardViews(cardId)

  const deqiViews = views.filter(v => v.user?.role === 'viewer')
  const redantexViews = views.filter(v => v.user?.role !== 'viewer')

  if (views.length === 0) return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
      <Eye className="h-3.5 w-3.5" />
      <span>Not seen yet</span>
    </div>
  )

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" /> Seen by
      </p>
      <div className="space-y-1.5">
        {views.map(v => (
          <div key={v.user_id} className="flex items-center gap-2">
            <Avatar name={v.user?.full_name ?? '?'} imageUrl={v.user?.avatar_url} size="xs" />
            <span className="text-xs flex-1 truncate">{v.user?.full_name}</span>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
              v.user?.role === 'viewer' ? 'bg-amber-50 text-amber-700' : 'bg-primary/10 text-primary'
            )}>
              {v.user?.role === 'viewer' ? 'DEQI' : 'Redantex'}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">{formatRelative(v.viewed_at)}</span>
          </div>
        ))}
      </div>

      {deqiViews.length === 0 && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1 pt-1">
          <Eye className="h-3 w-3" /> DEQI hasn't opened this card yet
        </p>
      )}
    </div>
  )
}
