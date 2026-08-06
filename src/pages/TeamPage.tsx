import { Users } from 'lucide-react'

export function TeamPage() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Team Management</p>
        <p className="text-sm mt-1">Invite and manage workspace members here.</p>
        <p className="text-xs text-muted-foreground mt-2">Configure your Supabase invitation Edge Function to enable invites.</p>
      </div>
    </div>
  )
}
