import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'

// Redantex and DEQI run eleven hours apart, so "why hasn't she replied" is
// usually just "it is 2am there". The dot answers that before you ask.
const ZONES = [
  { key: 'br', label: 'São Paulo', tz: 'America/Sao_Paulo' },
  { key: 'cn', label: 'DEQI', tz: 'Asia/Shanghai' },
] as const

function partsIn(tz: string, now: Date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short', hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  return {
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday ?? '',
    hour: Number(parts.hour),
  }
}

// Roughly office hours, weekdays. Enough to tell "they are around" from
// "you are writing into the night".
function isWorking(weekday: string, hour: number) {
  if (weekday === 'Sat' || weekday === 'Sun') return false
  return hour >= 8 && hour < 18
}

export function Clocks({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Half a minute is plenty for minute precision and costs nothing.
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={cn('flex items-center gap-3.5', className)}>
      {ZONES.map(z => {
        const { time, weekday, hour } = partsIn(z.tz, now)
        const working = isWorking(weekday, hour)
        return (
          <div key={z.key} className="flex items-center gap-1.5"
            title={`${z.label} — ${weekday} ${time}${working ? '' : ' · outside working hours'}`}>
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
              working ? 'bg-green-500' : 'bg-muted-foreground/40')} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {z.label}
            </span>
            <span className={cn('text-xs font-semibold tabular-nums',
              working ? 'text-foreground' : 'text-muted-foreground')}>
              {time}
            </span>
          </div>
        )
      })}
    </div>
  )
}
