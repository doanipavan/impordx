import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'

// Redantex and DEQI run eleven hours apart, so "why hasn't she replied" is
// usually "it is 2am there" — and the calendar date is often not even the same
// day, which is how a meeting gets booked for the wrong one.
const ZONES = [
  { key: 'br', label: 'São Paulo', tz: 'America/Sao_Paulo' },
  { key: 'cn', label: 'DEQI', tz: 'Asia/Shanghai' },
] as const

function readZone(tz: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now).map(p => [p.type, p.value]),
  )

  const hour = Number(parts.hour)
  const weekday = parts.weekday ?? ''

  return {
    time: `${parts.hour}:${parts.minute}`,
    // pt-BR gives "seg., 24 de ago." — trimmed to fit a narrow column.
    date: new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
    }).format(now).replace(/\./g, '').replace(' de ', ' '),
    // Roughly office hours on a weekday — enough to tell "they are around"
    // from "you are writing into the night".
    working: weekday !== 'Sat' && weekday !== 'Sun' && hour >= 8 && hour < 18,
  }
}

export function Clocks({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Half a minute is plenty for minute precision and costs nothing.
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={cn('flex items-start gap-5', className)}>
      {ZONES.map(z => {
        const t = readZone(z.tz, now)
        return (
          <div key={z.key} className="flex flex-col gap-0.5"
            title={`${z.label} — ${t.date}, ${t.time}${t.working ? '' : ' · fora do horário'}`}>
            <div className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                t.working ? 'bg-green-500' : 'bg-muted-foreground/40')} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                {z.label}
              </span>
            </div>
            <span className={cn('text-base font-semibold tabular-nums leading-none',
              t.working ? 'text-foreground' : 'text-muted-foreground')}>
              {t.time}
            </span>
            <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
              {t.date}
            </span>
          </div>
        )
      })}
    </div>
  )
}
