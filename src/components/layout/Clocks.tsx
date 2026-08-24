import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'

// Redantex and DEQI run eleven hours apart, so "why hasn't she replied" is
// usually "it is 2am there" — and the calendar date is often not even the same
// day, which is how a meeting gets booked for the wrong one.
const ZONES = [
  { key: 'br', label: 'São Paulo', tz: 'America/Sao_Paulo' },
  { key: 'cn', label: 'DEQI', tz: 'Asia/Shanghai' },
] as const

interface ZoneTime {
  hour: number
  minute: number
  weekday: string
  date: string
  working: boolean
}

function readZone(tz: string, now: Date): ZoneTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now).map(p => [p.type, p.value]),
  )

  const hour = Number(parts.hour)
  const weekday = parts.weekday ?? ''

  return {
    hour,
    minute: Number(parts.minute),
    weekday,
    // pt-BR gives "seg., 24 de ago." — too long for a 36px column.
    date: new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
    }).format(now).replace(/\./g, '').replace(' de ', ' '),
    // Roughly office hours on a weekday — enough to tell "they are around"
    // from "you are writing into the night".
    working: weekday !== 'Sat' && weekday !== 'Sun' && hour >= 8 && hour < 18,
  }
}

function Face({ hour, minute, working }: { hour: number; minute: number; working: boolean }) {
  const minuteAngle = minute * 6
  const hourAngle = (hour % 12) * 30 + minute * 0.5

  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" strokeWidth="1.5"
        className={working ? 'stroke-green-500' : 'stroke-border'} />

      {/* Quarter marks only — at this size anything more turns to mush. */}
      {[0, 90, 180, 270].map(a => (
        <line key={a} x1="20" y1="5.5" x2="20" y2="8.5"
          className="stroke-muted-foreground/50" strokeWidth="1.5" strokeLinecap="round"
          transform={`rotate(${a} 20 20)`} />
      ))}

      <line x1="20" y1="20" x2="20" y2="12" strokeWidth="2.2" strokeLinecap="round"
        className={working ? 'stroke-foreground' : 'stroke-muted-foreground'}
        transform={`rotate(${hourAngle} 20 20)`} />
      <line x1="20" y1="20" x2="20" y2="8" strokeWidth="1.6" strokeLinecap="round"
        className={working ? 'stroke-foreground' : 'stroke-muted-foreground'}
        transform={`rotate(${minuteAngle} 20 20)`} />

      <circle cx="20" cy="20" r="1.6"
        className={working ? 'fill-green-500' : 'fill-muted-foreground'} />
    </svg>
  )
}

export function Clocks({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Half a minute keeps the minute hand honest without repainting constantly.
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={cn('flex items-start gap-4', className)}>
      {ZONES.map(z => {
        const t = readZone(z.tz, now)
        return (
          <div key={z.key} className="flex flex-col items-center gap-0.5"
            title={`${z.label} — ${t.date}, ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}${t.working ? '' : ' · fora do horário'}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
              {z.label}
            </span>
            <Face hour={t.hour} minute={t.minute} working={t.working} />
            <span className={cn('text-[10px] leading-none tabular-nums',
              t.working ? 'text-foreground font-medium' : 'text-muted-foreground')}>
              {t.date}
            </span>
          </div>
        )
      })}
    </div>
  )
}
