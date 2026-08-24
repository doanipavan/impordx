import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Package, ShoppingCart, AlertCircle, Calendar, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Card as CardType } from '../types'
import { cn, formatDate, isOverdue, isDueSoon } from '../lib/utils'
import { STATUS_COLORS } from '../types'

function useDashboardData() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data: cards } = await supabase
        .from('cards')
        .select('*')
        .order('created_at', { ascending: false })

      const all = (cards ?? []) as CardType[]
      const active = all.filter((c) => !['Declined', 'Shipped', 'Approved'].includes(c.status))
      const overdue = active.filter((c) => isOverdue(c.deadline))
      const dueSoon = active.filter((c) => isDueSoon(c.deadline) && !isOverdue(c.deadline))
      const mine = active.filter((c) => c.project_manager_id === user?.id || c.salesperson_id === user?.id || c.created_by === user?.id)

      return { all, active, overdue, dueSoon, mine }
    },
    enabled: !!user,
  })
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading } = useDashboardData()

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  const { all = [], overdue = [], dueSoon = [], mine = [] } = data ?? {}

  const quotes = all.filter((c) => c.board === 'quotes')
  const samples = all.filter((c) => c.board === 'samples')
  const orders = all.filter((c) => c.board === 'orders')

  const stats = [
    { label: 'Active Quotes', value: quotes.filter((c) => !['Declined', 'Confirmed'].includes(c.status)).length, icon: MessageSquare, href: '/quotes', color: 'text-blue-600 bg-blue-50' },
    { label: 'Samples in Progress', value: samples.filter((c) => !['Approved'].includes(c.status)).length, icon: Package, href: '/samples', color: 'text-purple-600 bg-purple-50' },
    { label: 'Active Orders', value: orders.filter((c) => c.status !== 'Shipped').length, icon: ShoppingCart, href: '/orders', color: 'text-green-600 bg-green-50' },
    { label: 'Overdue', value: overdue.length, icon: AlertCircle, href: '/', color: overdue.length > 0 ? 'text-red-600 bg-red-50' : 'text-muted-foreground bg-muted' },
  ]

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">Good day, {user?.full_name.split(' ')[0]}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here is your workspace overview.</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, href, color }) => (
            <Link
              key={label}
              to={href}
              className="bg-card border border-border rounded-lg p-4 hover:shadow-card-hover transition-all group"
            >
              <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center mb-3', color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-2xl font-bold group-hover:text-primary transition-colors">{value}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </Link>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Overdue */}
          {overdue.length > 0 && (
            <Section title="Overdue Cards" icon={<AlertCircle className="h-4 w-4 text-destructive" />}>
              {overdue.slice(0, 5).map((card) => (
                <CardRow key={card.id} card={card} />
              ))}
              {overdue.length > 5 && <p className="text-xs text-muted-foreground text-center pt-1">+{overdue.length - 5} more</p>}
            </Section>
          )}

          {/* Due soon */}
          {dueSoon.length > 0 && (
            <Section title="Due This Week" icon={<Calendar className="h-4 w-4 text-amber-500" />}>
              {dueSoon.slice(0, 5).map((card) => (
                <CardRow key={card.id} card={card} />
              ))}
            </Section>
          )}

          {/* My tasks */}
          {mine.length > 0 && (
            <Section title="My Tasks" icon={<TrendingUp className="h-4 w-4 text-primary" />}>
              {mine.slice(0, 5).map((card) => (
                <CardRow key={card.id} card={card} />
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function CardRow({ card }: { card: CardType }) {
  const href = `/${card.board}`
  return (
    <Link
      to={href}
      className="flex items-center gap-2.5 py-1.5 hover:bg-accent rounded px-1 -mx-1 transition-colors group"
    >
      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', STATUS_COLORS[card.status])}>
        {card.status}
      </span>
      <span className="text-sm truncate group-hover:text-primary transition-colors">{card.title}</span>
      {card.deadline && (
        <span className={cn('text-xs ml-auto shrink-0', isOverdue(card.deadline) ? 'text-destructive font-medium' : 'text-muted-foreground')}>
          {formatDate(card.deadline)}
        </span>
      )}
    </Link>
  )
}
