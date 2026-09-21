import { cn } from '../../lib/utils'
import { ATTACHMENT_KINDS, AttachmentKind } from '../../lib/attachmentKinds'

/**
 * Reference · Sample · PI · Quotation, as one row of small buttons.
 *
 * Used next to every file waiting to be uploaded, and on a file that already
 * exists to change (or, for one from before the rule, to set) its category.
 * Nothing is selected until the person chooses: a default would be the old
 * "nobody pressed the button" in a new coat.
 */
export function KindPicker({ value, onChange, disabled, size = 'sm' }: {
  value: AttachmentKind | null
  onChange: (kind: AttachmentKind) => void
  disabled?: boolean
  size?: 'sm' | 'xs'
}) {
  return (
    <div role="radiogroup" aria-label="File category"
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/60 p-0.5">
      {ATTACHMENT_KINDS.map(k => {
        const on = value === k.id
        return (
          <button key={k.id} type="button" role="radio" aria-checked={on} disabled={disabled}
            onClick={() => onChange(k.id)} title={k.hint}
            className={cn(
              'rounded px-2 font-medium transition-colors whitespace-nowrap',
              size === 'xs' ? 'h-5 text-[10px]' : 'h-6 text-[11px]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
              on ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-60 cursor-not-allowed',
            )}>
            {k.label}
          </button>
        )
      })}
    </div>
  )
}

/** The category on a file, as a small chip. */
export function KindChip({ kind }: { kind: string | null | undefined }) {
  const tone = kind === 'sample' ? 'text-blue-700 bg-blue-100'
    : kind === 'pi' ? 'text-purple-700 bg-purple-100'
    : kind === 'quotation' ? 'text-emerald-700 bg-emerald-100'
    : kind === 'reference' ? 'text-slate-700 bg-slate-200'
    : 'text-muted-foreground bg-muted border border-dashed border-border'
  const label = ATTACHMENT_KINDS.find(k => k.id === kind)?.label ?? 'No category'
  return (
    <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0', tone)}>
      {label}
    </span>
  )
}
