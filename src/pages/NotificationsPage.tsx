import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Check, ArrowLeft, AtSign, MessageSquare, Paperclip, ArrowRight,
  CalendarClock, BellOff, CheckCheck,
} from 'lucide-react'
import {
  useNotifications, useMarkNotificationRead, useMarkManyRead, useSweepRead,
  useMutedCards, useMuteCard,
} from '../hooks/useNotifications'
import { Button } from '../components/ui/button'
import { Avatar } from '../components/ui/avatar'
import {
  groupByDay, dayInSaoPaulo, timeInSaoPaulo, agruparAnexos, grupoDe, tiposDoGrupo,
  GRUPOS, Grupo, Agrupada,
} from '../lib/notificationDays'
import { Notification } from '../types'
import { cn } from '../lib/utils'

/**
 * As notificações como um quadro de dias, com o que fazer com elas.
 *
 * Eram uma lista corrida, e o volume as tornava ilegíveis: 879 no total, 78%
 * vindas de uma única pessoa do outro lado, e apenas 7% — as menções — de
 * fato dirigidas a quem lê. O problema nunca foi falta de botão: era o que
 * importa estar enterrado.
 *
 * Daí a forma dos controles. Filtrar e varrer, em vez de selecionar uma a
 * uma: dois cliques — "Files", "marcar as 265" — limpam a categoria que mais
 * faz barulho, e o que sobra é a mesa com as menções em cima. Caixinhas de
 * seleção dariam mais controle e menos utilidade.
 *
 * A varredura conta no banco, não na tela: quem filtra por assunto quer
 * limpar o assunto, não os cinco dias que coube mostrar.
 */

const ICONES: Record<Grupo, { icone: typeof Bell; cor: string }> = {
  Mentions: { icone: AtSign, cor: 'bg-violet-100 text-violet-700' },
  Comments: { icone: MessageSquare, cor: 'bg-sky-100 text-sky-700' },
  Files: { icone: Paperclip, cor: 'bg-slate-100 text-slate-600' },
  Stages: { icone: ArrowRight, cor: 'bg-green-100 text-green-700' },
  Dates: { icone: CalendarClock, cor: 'bg-amber-100 text-amber-800' },
  Client: { icone: Check, cor: 'bg-orange-100 text-orange-700' },
}

/** O autor, como o filtro o identifica. `null` é o sistema. */
type Autor = { id: string | null; nome: string; total: number }

export function NotificationsPage() {
  const navigate = useNavigate()
  const { data: notifications = [], isLoading } = useNotifications()
  const { data: mudos = [] } = useMutedCards()
  const markRead = useMarkNotificationRead()
  const markMany = useMarkManyRead()
  const sweep = useSweepRead()
  const mute = useMuteCard()

  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [autor, setAutor] = useState<Autor | null>(null)
  const [soNaoLidas, setSoNaoLidas] = useState(false)

  const hoje = dayInSaoPaulo(new Date().toISOString())

  // Os números dos botões saem do que está carregado — são uma indicação de
  // onde está o volume, não um total do banco. O que precisa ser exato é a
  // varredura, e essa é contada lá.
  const porGrupo = useMemo(() => {
    const conta = {} as Record<Grupo, number>
    for (const n of notifications) {
      const g = grupoDe(n.type)
      if (g) conta[g] = (conta[g] ?? 0) + 1
    }
    return conta
  }, [notifications])

  const autores = useMemo<Autor[]>(() => {
    const por = new Map<string, Autor>()
    for (const n of notifications) {
      const id = n.actor_id ?? null
      const chave = id ?? 'system'
      const atual = por.get(chave)
      if (atual) atual.total += 1
      else por.set(chave, { id, nome: n.actor?.full_name ?? 'System', total: 1 })
    }
    return [...por.values()].sort((a, b) => b.total - a.total)
  }, [notifications])

  const filtradas = useMemo(() => notifications.filter((n) => {
    if (grupo && grupoDe(n.type) !== grupo) return false
    if (autor && (n.actor_id ?? null) !== autor.id) return false
    if (soNaoLidas && n.read) return false
    return true
  }), [notifications, grupo, autor, soNaoLidas])

  const dias = useMemo(() => groupByDay(filtradas, hoje), [filtradas, hoje])
  const naoLidasNaTela = filtradas.filter((n) => !n.read).length

  function varrer() {
    sweep.mutate({
      types: grupo ? tiposDoGrupo(grupo) : undefined,
      actorId: autor ? autor.id : undefined,
    })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-border shrink-0 flex items-start gap-3">
        <button onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent
            transition-colors mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">Notifications</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dias.length} day{dias.length === 1 ? '' : 's'} with activity · drag sideways for older
          </p>
        </div>
      </div>

      {/* Os filtros. Assunto em cima, quem mandou embaixo — com 78% vindo de
          uma pessoa só, separar por autor separa duas conversas. */}
      <div className="px-6 py-2.5 border-b border-border shrink-0 space-y-1.5">
        <div className="flex flex-wrap gap-1.5 items-center">
          <Chip on={!grupo} onClick={() => setGrupo(null)}>All</Chip>
          {GRUPOS.map((g) => (
            <Chip key={g} on={grupo === g} onClick={() => setGrupo(grupo === g ? null : g)}
              n={porGrupo[g] ?? 0}>{g}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-1">
            From
          </span>
          <Chip on={!autor} onClick={() => setAutor(null)}>Everyone</Chip>
          {autores.map((a) => (
            <Chip key={a.nome} on={autor?.nome === a.nome} n={a.total}
              onClick={() => setAutor(autor?.nome === a.nome ? null : a)}>{a.nome}</Chip>
          ))}
          <span className="w-px h-4 bg-border mx-1" />
          <Chip on={soNaoLidas} onClick={() => setSoNaoLidas(!soNaoLidas)}>Unread only</Chip>
        </div>
      </div>

      <div className="px-6 py-2 border-b border-border shrink-0 flex items-center justify-between
        bg-muted/20">
        <span className="text-[11.5px] text-muted-foreground">
          {filtradas.length} shown{naoLidasNaTela ? ` · ${naoLidasNaTela} unread` : ''}
        </span>
        {naoLidasNaTela > 0 ? (
          <Button size="sm" variant={grupo || autor ? 'default' : 'outline'}
            onClick={varrer} loading={sweep.isPending}>
            <CheckCheck className="h-3.5 w-3.5" />
            {grupo || autor
              ? `Mark every ${grupo ?? autor?.nome} notice as read`
              : 'Mark all as read'}
          </Button>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">nothing to clear here</span>
        )}
      </div>

      {isLoading && (
        <div className="flex gap-3 p-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 w-[300px] rounded-xl bg-muted animate-pulse shrink-0" />
          ))}
        </div>
      )}

      {!isLoading && dias.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {notifications.length === 0 ? 'All caught up' : 'Nothing matches these filters'}
            </p>
            <p className="text-sm mt-1">
              {notifications.length === 0 ? 'No notifications yet.' : 'Try widening them.'}
            </p>
          </div>
        </div>
      )}

      {!isLoading && dias.length > 0 && (
        <div className="flex-1 min-h-0 overflow-x-auto">
          <div className="flex gap-3 px-6 py-4 items-start h-full">
            {dias.map((dia) => {
              const agrupadas = agruparAnexos(dia.items)
              return (
                <div key={dia.day} className="shrink-0 w-[300px] flex flex-col max-h-full">
                  <div className="flex items-baseline justify-between gap-2 px-1 pb-2 shrink-0">
                    <p className={cn('text-[12.5px] font-bold truncate',
                      dia.day === hoje ? 'text-primary' : '')}>{dia.label}</p>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground">
                        {agrupadas.length}{dia.unread > 0 ? ` · ${dia.unread} new` : ''}
                      </span>
                      {dia.unread > 0 && (
                        <button
                          onClick={() => markMany.mutate(
                            dia.items.filter((n) => !n.read).map((n) => n.id))}
                          className="text-[10px] text-muted-foreground hover:text-foreground">
                          ✓ day
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 overflow-y-auto scrollbar-thin pr-1">
                    {agrupadas.map((g) => (
                      <Cartao key={g.head.id} grupo={g}
                        mudo={!!g.head.card_id && mudos.includes(g.head.card_id)}
                        onOpen={() => {
                          markMany.mutate(g.all.filter((n) => !n.read).map((n) => n.id))
                          if (g.head.card?.ref_number) {
                            navigate(`/${g.head.card.board}/${g.head.card.ref_number}`)
                          }
                        }}
                        onRead={() => {
                          if (g.count === 1) markRead.mutate(g.head.id)
                          else markMany.mutate(g.all.filter((n) => !n.read).map((n) => n.id))
                        }}
                        onMute={(mudo) => {
                          if (g.head.card_id) mute.mutate({ cardId: g.head.card_id, mute: mudo })
                        }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="px-6 py-2.5 border-t border-border shrink-0 text-[11px] text-muted-foreground">
        You are notified when someone @mentions you, comments on a card you are part of, or moves
        one to another status. Muting a card stops new notices from it — what already arrived stays.
      </p>
    </div>
  )
}

function Chip({ on, n, onClick, children }: {
  on: boolean; n?: number; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} className={cn(
      'text-[11.5px] px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5',
      on ? 'bg-foreground text-background border-foreground font-semibold'
        : 'bg-card border-border text-foreground hover:bg-muted')}>
      {children}
      {n != null && (
        <span className={cn('text-[10px]', on ? 'text-background/70' : 'text-muted-foreground')}>
          {n}
        </span>
      )}
    </button>
  )
}

function Cartao({ grupo, mudo, onOpen, onRead, onMute }: {
  grupo: Agrupada<Notification>
  mudo: boolean
  onOpen: () => void
  onRead: () => void
  onMute: (mudo: boolean) => void
}) {
  const n = grupo.head
  // Card apagado deixa a notificação para trás com `card_id` nulo: não há
  // para onde ir, e fingir que há é pior que dizer.
  const alvo = !!n.card?.ref_number
  const g = grupoDe(n.type)
  const { icone: Icone, cor } = g
    ? ICONES[g]
    : { icone: Bell, cor: 'bg-muted text-muted-foreground' }

  // Juntadas, as quatro linhas de arquivo viram uma — com o número à vista,
  // porque esconder quantas foram seria esconder o volume.
  const texto = grupo.count > 1
    ? `${n.actor?.full_name ?? 'Someone'} added ${grupo.count} files to “${n.card?.title ?? 'a card'}”`
    : n.message

  return (
    <div className={cn('group rounded-lg border px-2.5 py-2 bg-card transition-colors',
      grupo.read ? 'border-border' : 'border-primary/40 bg-primary/[0.03]')}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn('h-4 w-4 rounded flex items-center justify-center shrink-0', cor)}>
          <Icone className="h-2.5 w-2.5" />
        </span>
        {n.actor && <Avatar name={n.actor.full_name} imageUrl={n.actor.avatar_url} size="xs" />}
        <span className="text-[10.5px] text-muted-foreground tabular-nums">
          {timeInSaoPaulo(n.created_at)}
        </span>

        {/* Aparecem no hover: a tela é de leitura, e um botão em cada cartão o
            tempo todo competiria com o texto. */}
        <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100
          transition-opacity">
          {!grupo.read && (
            <button onClick={onRead} title="Mark read"
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent">
              <Check className="h-3 w-3" />
            </button>
          )}
          {n.card_id && (
            <button onClick={() => onMute(!mudo)}
              title={mudo ? 'Unmute this card' : 'Stop notices from this card'}
              className={cn('p-0.5 rounded hover:bg-accent',
                mudo ? 'text-amber-600' : 'text-muted-foreground hover:text-foreground')}>
              <BellOff className="h-3 w-3" />
            </button>
          )}
        </span>
        {!grupo.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 ml-0.5" />}
      </div>

      <button onClick={alvo ? onOpen : undefined} disabled={!alvo}
        className={cn('text-left w-full', alvo ? 'cursor-pointer' : 'cursor-default')}>
        {/* Três linhas e corta: o pedido de ajuste de uma cliente veio com o
            texto inteiro e sozinho ocupava meia tela. */}
        <p className="text-[12.5px] leading-snug line-clamp-3">{texto}</p>
        {n.card ? (
          <p className="text-[10.5px] text-muted-foreground mt-1 truncate font-mono">
            {n.card.ref_number}
            {mudo && <span className="ml-1 not-italic text-amber-600">· muted</span>}
          </p>
        ) : (
          <p className="text-[10.5px] text-muted-foreground/70 mt-1 italic">
            card no longer available
          </p>
        )}
      </button>
    </div>
  )
}
