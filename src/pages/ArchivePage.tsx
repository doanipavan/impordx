import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Card, STATUS_COLORS, BOARD_LABELS } from '../types'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/button'
import { cn, formatDate } from '../lib/utils'

function useArchivedCards() {
  return useQuery({
    queryKey: ['archived'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('archived', true)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as Card[]
    },
  })
}

export function ArchivePage() {
  const navigate = useNavigate()
  const { data: cards = [], isLoading } = useArchivedCards()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'quotes' | 'samples' | 'orders'>('all')

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cards').update({ archived: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archived'] }),
  })

  const permanentDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cards').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archived'] }),
  })

  const filtered = filter === 'all' ? cards : cards.filter(c => c.board === filter)

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Archive</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Archived cards are hidden from boards but not deleted.</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-1.5">
          {(['all', 'quotes', 'samples', 'orders'] as const).map(b => (
            <button key={b} onClick={() => setFilter(b)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize',
                filter === b ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {b === 'all' ? `All (${cards.length})` : `${BOARD_LABELS[b]} (${cards.filter(c => c.board === b).length})`}
            </button>
          ))}
        </div>

        {isLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Archive className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No archived cards</p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(card => (
            <div key={card.id} className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:shadow-card transition-all group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_COLORS[card.status])}>{card.status}</span>
                  <span className="text-[10px] text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{card.board}</span>
                  {card.ref_number && <span className="text-[10px] font-mono text-muted-foreground">{card.ref_number}</span>}
                </div>
                <p className="text-sm font-medium truncate">{card.title}</p>
                {card.client_name && <p className="text-xs text-muted-foreground">{card.client_name}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">Archived {formatDate(card.updated_at)}</p>
              </div>

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button size="sm" variant="outline" onClick={() => restore.mutate(card.id)} loading={restore.isPending}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </Button>
                {user?.role === 'admin' && (
                  <Button size="sm" variant="destructive" onClick={() => {
                    if (confirm('Permanently delete this card? This cannot be undone.'))
                      permanentDelete.mutate(card.id)
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
