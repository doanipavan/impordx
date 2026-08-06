import { cn, getInitials } from '../../lib/utils'

interface AvatarProps {
  name: string
  imageUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const COLORS = [
  'bg-red-100 text-red-700',
  'bg-orange-100 text-orange-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-teal-100 text-teal-700',
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
]

function getColorClass(name: string): string {
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % COLORS.length
  return COLORS[idx]
}

export function Avatar({ name, imageUrl, size = 'sm', className }: AvatarProps) {
  const sizeClass = {
    xs: 'h-5 w-5 text-[10px]',
    sm: 'h-7 w-7 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  }[size]

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn('rounded-full object-cover ring-1 ring-white', sizeClass, className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold ring-1 ring-white shrink-0',
        sizeClass,
        getColorClass(name),
        className
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  )
}
