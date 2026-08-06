import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastType = 'success' | 'error' | 'info'
interface Toast { id: string; message: string; type: ToastType }

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg text-sm min-w-[280px] max-w-sm pointer-events-auto animate-slide-up',
              {
                'bg-green-50 text-green-800 border border-green-200': t.type === 'success',
                'bg-red-50 text-red-800 border border-red-200': t.type === 'error',
                'bg-white text-foreground border border-border': t.type === 'info',
              }
            )}
          >
            {t.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="h-4 w-4 shrink-0 mt-0.5" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}
