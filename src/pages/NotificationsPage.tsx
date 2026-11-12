import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Check, ArrowLeft, AtSign, MessageSquare, Paperclip, ArrowRight,
  CalendarClock, AlarmClock, PenLine,
} from 'lucide-react'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '../hooks/useNotifications'
import { Button } from '../components/ui/button'
import { Avatar } from '../components/ui/avatar'
import { groupByDay, dayInSaoPaulo, timeInSaoPaulo } from '../lib/notificationDays'
import { Notification } from '../types'
import { cn } from '../lib/utils'

/**
 * As notificações como um quadro de dias.
 *
 * Eram uma lista corrida com "1 day ago" em cada linha, e o volume real as
 * tornava ilegíveis: num sábado deste mês chegaram 55 de uma vez. Em lista,
 * isso é rolar até cansar; em coluna, é uma torre que se vê de longe.
 *
 * Uma coluna por dia, mais recente à esquerda, arrastando para o passado — o
 * mesmo gesto do painel de vendas e do email diário.
 */

// Dentro de uma coluna de 300px a cor faz o trabalho que o texto não tem
// espaço para fazer. As famílias são as do resto do hub.
const TIPOS: Record<string, { icone: typeof Bell; cor: string }> = {
  mention: { icone: AtSign, cor: 'bg-violet-100 text-violet-700' },
  comment: { icone: MessageSquare, cor: 'bg-sky-100 text-sky-700' },
  attachment: { icone: Paperclip, cor: 'bg-slate-100 text-slate-600' },
  status_change: { icone: ArrowRight, cor: 'bg-green-100 text-green-700' },
  delivery_set: { icone: CalendarClock, cor: 'bg-amber-100 text-amber-800' },
  delivery_change: { icone: CalendarClock, cor: 'bg-amber-100 text-amber-800' },
  due_soon: { icone: AlarmClock, cor: 'bg-amber-100 text-amber-800' },
  client_approved: { icone: Check, cor: 'bg-green-100 text-green-700' },
  client_changes: { icone: PenLine, cor: 'bg-orange-100 text-orange-700' },
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const { data: notifications = [], isLoading } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllRead()

  const hoje = dayInSaoPaulo(new Date().toISOString())
  const dias = useMemo(() => groupByDay(notifications, hoje), [notifications, hoje])
  const unread = notifications.filter((n) => !n.read)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border shrink-0 flex items-start gap-3">
        <button onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent
            transition-colors mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">Notifications</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unread.length > 0 ? `${unread.length} unread · ` : ''}
            {dias.length} day{dias.length === 1 ? '' : 's'} with activity · drag sideways for older
          </p>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}
            loading={markAllRead.isPending}>
            <Check className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex gap-3 p-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 w-[300px] rounded-xl bg-muted animate-pulse shrink-0" />
          ))}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">All caught up</p>
            <p className="text-sm mt-1">No notifications yet.</p>
          </div>
        </div>
      )}

      {!isLoading && dias.length > 0 && (
        <div className="flex-1 min-h-0 overflow-x-auto">
          <div className="flex gap-3 px-6 py-4 items-start h-full">
            {dias.map((dia) => (
              <div key={dia.day} className="shrink-0 w-[300px] flex flex-col max-h-full">
                <div className="flex items-baseline justify-between px-1 pb-2 shrink-0">
                  <p className={cn('text-[12.5px] font-bold',
                    dia.day === hoje ? 'text-primary' : '')}>{dia.label}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {dia.items.length}
                    {dia.unread > 0 ? ` · ${dia.unread} new` : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 overflow-y-auto scrollbar-thin pr-1">
                  {dia.items.map((n) => (
                    <Cartao key={n.id} n={n}
                      onOpen={() => {
                        if (!n.read) markRead.mutate(n.id)
                        if (n.card?.ref_number) navigate(`/${n.card.board}/${n.card.ref_number}`)
                      }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="px-6 py-2.5 border-t border-border shrink-0 text-[11px] text-muted-foreground">
        You are notified when someone @mentions you, comments on a card you are part of, or moves
        one to another status. Click a notification to open its card.
      </p>
    </div>
  )
}

function Cartao({ n, onOpen }: { n: Notification; onOpen: () => void }) {
  // Card apagado deixa a notificação para trás com `card_id` nulo: não há
  // para onde ir, e fingir que há é pior que dizer.
  const alvo = !!n.card?.ref_number
  const tipo = TIPOS[n.type ?? ''] ?? { icone: Bell, cor: 'bg-muted text-muted-foreground' }
  const Icone = tipo.icone

  return (
    <button onClick={alvo ? onOpen : undefined} disabled={!alvo}
      className={cn('text-left rounded-lg border px-2.5 py-2 bg-card transition-colors',
        alvo ? 'cursor-pointer hover:border-muted-foreground/40' : 'cursor-default',
        n.read ? 'border-border' : 'border-primary/40 bg-primary/[0.03]')}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn('h-4 w-4 rounded flex items-center justify-center shrink-0', tipo.cor)}>
          <Icone className="h-2.5 w-2.5" />
        </span>
        {n.actor && (
          <Avatar name={n.actor.full_name} imageUrl={n.actor.avatar_url} size="xs" />
        )}
        <span className="text-[10.5px] text-muted-foreground tabular-nums">
          {timeInSaoPaulo(n.created_at)}
        </span>
        {!n.read && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
      </div>

      {/* Três linhas e corta: o pedido de ajuste de uma cliente veio com o
          texto inteiro e sozinho ocupava meia tela. */}
      <p className="text-[12.5px] leading-snug line-clamp-3">{n.message}</p>

      {n.card ? (
        <p className="text-[10.5px] text-muted-foreground mt-1 truncate font-mono">
          {n.card.ref_number}
        </p>
      ) : (
        <p className="text-[10.5px] text-muted-foreground/70 mt-1 italic">
          card no longer available
        </p>
      )}
    </button>
  )
}
