import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BoardType, BOARD_LABELS, Card } from '../types'
import { Board } from '../components/board/Board'
import { OrdersGantt } from '../components/board/OrdersGantt'
import { ExportOrders } from '../components/board/ExportOrders'
import { ImportCard } from '../components/board/ImportCard'
import { SupplierSwitch } from '../components/board/SupplierSwitch'
import { BoardTotals } from '../components/board/BoardTotals'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export function QuotesPage()  { return <BoardPage board="quotes" /> }
export function SamplesPage() { return <BoardPage board="samples" /> }
export function OrdersPage()  { return <BoardPage board="orders" /> }

function BoardPage({ board }: { board: BoardType }) {
  const { user } = useAuth()
  const { ref } = useParams<{ ref?: string }>()
  const navigate = useNavigate()
  const [autoOpenCard, setAutoOpenCard] = useState<Card | null>(null)
  const [refError, setRefError] = useState(false)

  useEffect(() => {
    if (!ref) return
    supabase
      .from('cards')
      .select('*')
      .eq('ref_number', ref.toUpperCase())
      .eq('board', board)
      .single()
      .then(({ data, error }) => {
        if (data) {
          setAutoOpenCard(data as Card)
        } else {
          setRefError(true)
          // Clear bad ref from URL
          setTimeout(() => { navigate('/' + board, { replace: true }); setRefError(false) }, 3000)
        }
      })
  }, [ref, board, navigate])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-card shrink-0 flex items-start gap-4">
        <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold">{BOARD_LABELS[board]}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {board === 'quotes' && 'Request for Quotation — track pricing and negotiation with DEQI'}
          {board === 'samples' && 'Track sample production and approval flow'}
          {board === 'orders' && 'Monitor production status and delivery'}
        </p>
        {refError && (
          <p className="text-xs text-destructive mt-1">
            Reference "{ref}" not found. Redirecting...
          </p>
        )}
        </div>

        <div className="shrink-0 mr-44 flex items-center gap-2">
          {/* Scope before contents: which supplier this page is showing is read
              before anything on the board itself. Renders nothing when there is
              only one supplier to choose from, which is every supplier login. */}
          <SupplierSwitch className="mr-1" />

          {/* A spec can be typed into a spreadsheet before it is a card, but an
              order is only ever promoted from a quote or a sample. */}
          {board !== 'orders' && user?.role !== 'viewer' && <ImportCard board={board} />}

          {/* Purchase and sales order numbers are on this sheet, so it is not
              something the supplier should be able to pull. */}
          {board === 'orders' && user?.role !== 'viewer' && <ExportOrders />}
        </div>
      </div>
      <div className="flex-1 overflow-hidden py-4 flex flex-col">
        {/* Só a Redantex vê os dois lados do preço. O componente decide
            sozinho se aparece, e Quotes fica de fora: lá quase nada tem preço
            ainda, e uma tabela de zeros não informa nada. */}
        {board !== 'quotes' && <BoardTotals board={board} />}

        {/* Only orders run a 120-day clock, so only orders get a timeline. */}
        {board === 'orders' && <OrdersGantt />}
        <div className="flex-1 overflow-hidden">
          <Board board={board} autoOpenCard={autoOpenCard} onAutoOpenClear={() => { setAutoOpenCard(null); navigate('/' + board, { replace: true }) }} />
        </div>
      </div>
    </div>
  )
}
