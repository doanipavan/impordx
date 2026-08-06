import { ReactNode, useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}

export function Dropdown({ trigger, children, align = 'left', className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative inline-flex">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg py-1 animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({
  children,
  onClick,
  className,
  destructive,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  destructive?: boolean
  icon?: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left',
        destructive && 'text-destructive hover:bg-destructive/10',
        className
      )}
    >
      {icon && <span className="h-4 w-4 shrink-0">{icon}</span>}
      {children}
    </button>
  )
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border" />
}
