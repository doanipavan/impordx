import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './components/ui/toast'
import { Layout } from './components/layout/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { QuotesPage, SamplesPage, OrdersPage } from './pages/BoardPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ArchivePage } from './pages/ArchivePage'
import { TeamPage } from './pages/TeamPage'
import { SettingsPage } from './pages/SettingsPage'
import { Loader2 } from 'lucide-react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 30 },
  },
})

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!session) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/quotes" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
      <Route path="/quotes/:ref" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
      <Route path="/samples" element={<ProtectedRoute><SamplesPage /></ProtectedRoute>} />
      <Route path="/samples/:ref" element={<ProtectedRoute><SamplesPage /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/orders/:ref" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/archive" element={<ProtectedRoute><ArchivePage /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
