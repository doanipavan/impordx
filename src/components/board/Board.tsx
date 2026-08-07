import { useState, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { BoardType, Card, CardStatus, BOARD_COLUMNS } from '../../types'
import { useCards, useMoveCard } from '../../hooks/useCards'
import { useToast } from '../ui/toast'
import { Column } from './Column'
import { KanbanCard } from './KanbanCard'
import { CardModal } from '../card/CardModal'
import { CreateCardModal } from '../card/CreateCardModal'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '../ui/button'

interface BoardProps {
  board: BoardType
  autoOpenCard?: Card | null
  onAutoOpenClear?: () => void
}

export function Board({ board, autoOpenCard, onAutoOpenClear }: BoardProps) {
  const { data: cards = [], isLoading } = useCards(board)
  const moveCard = useMoveCard()
  const toast = useToast()
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [openCard, setOpenCard] = useState<Card | null>(autoOpenCard ?? null)
  const [creating, setCreating] = useState<CardStatus | null>(null)

  // Auto-open when ref link is followed
  useEffect(() => {
    if (autoOpenCard) setOpenCard(autoOpenCard)
  }, [autoOpenCard])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const columns = BOARD_COLUMNS[board]
  const cardsByStatus = Object.fromEntries(
    columns.map((col) => [col, cards.filter((c) => c.status === col)])
  )

  function handleDragStart({ active }: DragStartEvent) {
    const card = cards.find((c) => c.id === active.id)
    if (card) setActiveCard(card)
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null)
    if (!over) return

    const card = cards.find((c) => c.id === active.id)
    if (!card) return

    const newStatus = over.id as CardStatus
    if (!columns.includes(newStatus)) return
    if (card.status === newStatus) return

    try {
      await moveCard.mutateAsync({ id: card.id, status: newStatus, board })
      toast(`Moved to "${newStatus}"`, 'success')
    } catch {
      toast('Failed to move card', 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full overflow-x-auto pb-4 px-6 scrollbar-thin">
          {columns.map((status) => (
            <Column
              key={status}
              status={status}
              cards={cardsByStatus[status] ?? []}
              board={board}
              onCardClick={setOpenCard}
              onAddCard={() => setCreating(status)}
            />
          ))}

          {/* Add column shortcut */}
          <div className="flex items-start pt-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreating(columns[0])}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              New card
            </Button>
          </div>
        </div>

        <DragOverlay>
          {activeCard && (
            <KanbanCard
              card={activeCard}
              isDragging
              onClick={() => {}}
            />
          )}
        </DragOverlay>
      </DndContext>

      {openCard && (
        <CardModal
          card={openCard}
          board={board}
          onClose={() => setOpenCard(null)}
        />
      )}

      {creating && (
        <CreateCardModal
          board={board}
          initialStatus={creating}
          onClose={() => setCreating(null)}
        />
      )}
    </>
  )
}
