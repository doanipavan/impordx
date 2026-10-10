import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './components/ui/toast'
import { Layout } from './components/layout/Layout'
import { LoginPage } from './pages/Login'
import { ApprovalPage } from './pages/ApprovalPage'
import { VerifyPage } from './pages/VerifyPage'
import { DashboardPage } from './pages/Dashboard'
import { QuotesPage, SamplesPage, OrdersPage } from './pages/BoardPage'
import { TimelinePage } from './pages/TimelinePage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ArchivePage } from './pages/ArchivePage'
import { FinancePage } from './pages/FinancePage'
import { SalesPage } from './pages/SalesPage'
import { MeusPedidos } from './pages/MeusPedidos'
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
      {/* O link do cliente. Sem login e sem Layout: quem abre não tem conta,
          e o que ele vê vem inteiro da função approval_view. */}
      <Route path="/aprovar/:token" element={<ApprovalPage />} />
      {/* A conferência do comprovante, também sem login: é ela que faz o
          registro servir de prova para quem não tem acesso ao hub. */}
      {/* A carteira do vendedor: pública como a aprovação do cliente,
          aberta por token, sem conta. */}
      <Route path="/meus-pedidos/:token" element={<MeusPedidos />} />
      <Route path="/verificar" element={<VerifyPage />} />
      <Route path="/verificar/:code" element={<VerifyPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/quotes" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
      <Route path="/quotes/:ref" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
      <Route path="/samples" element={<ProtectedRoute><SamplesPage /></ProtectedRoute>} />
      <Route path="/samples/:ref" element={<ProtectedRoute><SamplesPage /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/orders/:ref" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
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
