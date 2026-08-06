import { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
        {
          'bg-primary/10 text-primary': variant === 'default',
          'bg-secondary text-secondary-foreground': variant === 'secondary',
          'border border-current': variant === 'outline',
          'bg-destructive/10 text-destructive': variant === 'destructive',
        },
        className
      )}
      {...props}
    />
  )
}
