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
import { BoardType, Card, CardStatus, BOARD_COLUMNS, visibleColumns } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { useCards, useMoveCard } from '../../hooks/useCards'
import { useSupplierFilter, matchesSupplier, useSuppliers } from '../../hooks/useSupplierFilter'
import { useToast } from '../ui/toast'
import { errorText } from '../../lib/utils'
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
  const { user } = useAuth()
  const { data: cards = [], isLoading } = useCards(board)
  const moveCard = useMoveCard()
  const [supplierFilter] = useSupplierFilter()
  const { data: suppliers = [] } = useSuppliers()
  const toast = useToast()
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  // Only the id is held. Storing the card object froze it at click time, so
  // everything the modal read stayed as it was when the row was clicked —
  // changing a card's collection and then not being offered that collection's
  // sizes was this bug wearing a different hat.
  const [openCardId, setOpenCardId] = useState<string | null>(autoOpenCard?.id ?? null)
  const [creating, setCreating] = useState<CardStatus | null>(null)

  // The list is the source; the fetched card only stands in until it arrives,
  // which is the gap a ref link opens through.
  const openCard = openCardId
    ? cards.find((c) => c.id === openCardId)
      ?? (autoOpenCard?.id === openCardId ? autoOpenCard : null)
    : null

  // Auto-open when ref link is followed
  useEffect(() => {
    if (autoOpenCard) setOpenCardId(autoOpenCard.id)
  }, [autoOpenCard])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // The supplier never sees Redantex's own intake columns, so a card is
  // simply absent from their board until it reaches a stage that is theirs.
  const columns = visibleColumns(board, user?.role === 'viewer')
  // The switch above the board and the board itself have to agree, so the
  // filter is applied once, here, and the counts fall out of it.
  const inScope = cards.filter((c) => matchesSupplier(c, supplierFilter))

  // 'Under DEQI Revision' is a column Sconcept sees too. Nobody should read the
  // other supplier's name off their own board, so the column carries whichever
  // supplier is in scope — and stays generic when that is more than one.
  const scopedSupplierName = suppliers.find((s) => s.id === supplierFilter)?.short_name
  const ownSupplierName = suppliers.length === 1 ? suppliers[0].short_name : undefined
  const columnSupplierName = ownSupplierName ?? scopedSupplierName
  const cardsByStatus = Object.fromEntries(
    columns.map((col) => [col, inScope.filter((c) => c.status === col)])
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
    } catch (err) {
      // Dragging hits the same gates as the buttons, so it owes the same answer.
      toast(errorText(err) ?? 'Failed to move card', 'error')
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
              supplierName={columnSupplierName}
              onCardClick={(c) => setOpenCardId(c.id)}
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
          onClose={() => setOpenCardId(null)}
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
