import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BoardType, BOARD_LABELS, Card } from '../types'
import { Board } from '../components/board/Board'
import { supabase } from '../lib/supabase'

export function QuotesPage()  { return <BoardPage board="quotes" /> }
export function SamplesPage() { return <BoardPage board="samples" /> }
export function OrdersPage()  { return <BoardPage board="orders" /> }

function BoardPage({ board }: { board: BoardType }) {
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
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
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
      <div className="flex-1 overflow-hidden py-4">
        <Board board={board} autoOpenCard={autoOpenCard} onAutoOpenClear={() => { setAutoOpenCard(null); navigate('/' + board, { replace: true }) }} />
      </div>
    </div>
  )
}
