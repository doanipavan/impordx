import { Component, ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

// Without this, one bad render anywhere turns the whole app into a blank white
// page — no message, no way back, and nothing to report. Twice already a
// realtime channel collision did exactly that. This keeps the failure legible
// and recoverable, and puts the actual error on screen so it can be relayed.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Unhandled render error:', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-modal">
          <div className="flex items-center gap-2.5 mb-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <h1 className="text-base font-semibold">Something broke on this screen</h1>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Your data is safe — nothing was lost. Reloading usually fixes it.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <RotateCw className="h-4 w-4" />
            Reload
          </button>

          <details className="mt-5">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Technical details
            </summary>
            <pre className="mt-2 text-[11px] bg-muted rounded p-2.5 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
