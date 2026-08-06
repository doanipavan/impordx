import { BoardType, BOARD_LABELS } from '../types'
import { Board } from '../components/board/Board'

export function QuotesPage() {
  return <BoardPage board="quotes" />
}
export function SamplesPage() {
  return <BoardPage board="samples" />
}
export function OrdersPage() {
  return <BoardPage board="orders" />
}

function BoardPage({ board }: { board: BoardType }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <h1 className="text-lg font-semibold">{BOARD_LABELS[board]}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {board === 'quotes' && 'Request for Quotation — track pricing and negotiation with DEQI'}
          {board === 'samples' && 'Track sample production and approval flow'}
          {board === 'orders' && 'Monitor production status and delivery'}
        </p>
      </div>
      <div className="flex-1 overflow-hidden py-4">
        <Board board={board} />
      </div>
    </div>
  )
}
