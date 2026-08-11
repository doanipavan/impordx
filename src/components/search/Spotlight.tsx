import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, FileText, Package, ShoppingCart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Card, STATUS_COLORS, BoardType } from '../../types'
import { cn } from '../../lib/utils'

const BOARD_ICONS = { quotes: FileText, samples: Package, orders: ShoppingCart }
const BOARD_COLORS = {
  quotes: 'bg-blue-100 text-blue-700',
  samples: 'bg-purple-100 text-purple-700',
  orders: 'bg-green-100 text-green-700',
}
const BOARD_LABELS: Record<string, string> = { quotes: 'QUO', samples: 'SMP', orders: 'ORD' }

export function Spotlight({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('cards')
        .select('id, title, board, status, ref_number, client_name, collection, priority')
        .or(`title.ilike.%${query}%,ref_number.ilike.%${query}%,client_name.ilike.%${query}%,collection.ilike.%${query}%`)
        .eq('archived', false)
        .order('updated_at', { ascending: false })
        .limit(8)
      setResults((data ?? []) as Card[])
      setSelected(0)
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  function openCard(card: Card) {
    navigate(`/${card.board}/${card.ref_number ?? card.id}`)
    onClose()
  }

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) openCard(results[selected])
  }, [results, selected])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl bg-card rounded-2xl shadow-modal border border-border overflow-hidden animate-slide-up">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by ref, title or client..."
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {loading && <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="py-1.5 max-h-[400px] overflow-y-auto scrollbar-thin">
            {results.map((card, i) => {
              const Icon = BOARD_ICONS[card.board as BoardType]
              return (
                <li key={card.id}>
                  <button
                    onClick={() => openCard(card)}
                    onMouseEnter={() => setSelected(i)}
                    className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors', selected === i ? 'bg-accent' : 'hover:bg-accent/50')}
                  >
                    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', BOARD_COLORS[card.board])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{card.title}</span>
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', STATUS_COLORS[card.status])}>{card.status}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {card.ref_number && <span className="text-xs font-mono text-muted-foreground">{card.ref_number}</span>}
                        {card.client_name && <span className="text-xs text-muted-foreground">· {card.client_name}</span>}
                        {card.collection && <span className="text-xs text-muted-foreground">· {card.collection}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{BOARD_LABELS[card.board]}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {query.trim() && !loading && results.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No results for "{query}"</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[11px] text-muted-foreground">
            <span><kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px]">↑↓</kbd> navigate</span>
            <span><kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px]">Enter</kbd> open</span>
            <span><kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px]">Esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  )
}
