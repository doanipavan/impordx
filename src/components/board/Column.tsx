import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Card, CardStatus, BoardType } from '../../types'
import { KanbanCard } from './KanbanCard'
import { cn } from '../../lib/utils'

const STATUS_STYLES: Partial<Record<CardStatus, string>> = {
  Requested: 'border-t-slate-400',
  Quoted: 'border-t-blue-400',
  Confirmed: 'border-t-green-400',
  Declined: 'border-t-red-400',
  'In Preparation': 'border-t-purple-400',
  'Under Revision': 'border-t-amber-400',
  Approved: 'border-t-green-400',
  Placed: 'border-t-slate-400',
  'In Production': 'border-t-blue-400',
  'Ready to Ship': 'border-t-teal-400',
  Shipped: 'border-t-green-400',
}

interface ColumnProps {
  status: CardStatus
  cards: Card[]
  board: BoardType
  onCardClick: (card: Card) => void
  onAddCard: () => void
}

export function Column({ status, cards, onCardClick, onAddCard }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className={cn('flex items-center justify-between mb-3 px-1')}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{status}</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
            {cards.length}
          </span>
        </div>
        <button
          onClick={onAddCard}
          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={`Add card to ${status}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Cards area */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex flex-col gap-2 min-h-[120px] p-2 rounded-lg border-2 border-dashed transition-colors flex-1',
            isOver ? 'border-primary/40 bg-primary/5' : 'border-transparent',
            'border-t-[3px] border-t-solid',
            STATUS_STYLES[status]
          )}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onClick={() => onCardClick(card)}
            />
          ))}

          {cards.length === 0 && !isOver && (
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground/60 text-center">No cards</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
