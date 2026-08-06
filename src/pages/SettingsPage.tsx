import { Settings } from 'lucide-react'

export function SettingsPage() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <Settings className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Workspace Settings</p>
        <p className="text-sm mt-1">Logo, colors and workspace configuration.</p>
      </div>
    </div>
  )
}
