import { Archive } from 'lucide-react'

export function ArchivePage() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <Archive className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Archive</p>
        <p className="text-sm mt-1">Archived cards will appear here.</p>
      </div>
    </div>
  )
}
