import { cn } from '../../lib/utils'
import { useDensity, setDensity, Density } from '../../hooks/useDensity'

/**
 * Limpo ou completo.
 *
 * Dois botões à vista, como o filtro de fornecedor ao lado, e não um menu: são
 * duas opções, e um menu para duas opções esconde metade da resposta.
 */
const OPCOES: Array<{ value: Density; label: string; title: string }> = [
  { value: 'clean', label: 'Clean', title: 'Bars only — history and the supplier diamond stay one click away' },
  { value: 'full', label: 'Full', title: 'Every status change, the supplier diamond on every row, and the leg labels' },
]

export function DensityToggle({ className }: { className?: string }) {
  const density = useDensity()

  return (
    <div className={cn('flex items-center rounded-md border border-input bg-background p-0.5', className)}
      role="group" aria-label="Chart detail">
      {OPCOES.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setDensity(o.value)}
          title={o.title}
          aria-pressed={density === o.value}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded transition-colors',
            density === o.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
