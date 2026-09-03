import { ReactNode, useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Package, ShoppingCart, Bell, Archive,
  Users, Settings, ChevronLeft, ChevronRight, LogOut, Menu, Search
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Clocks } from './Clocks'
import { useAuth } from '../../hooks/useAuth'
import { useUnreadCount } from '../../hooks/useNotifications'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Spotlight } from '../search/Spotlight'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/quotes', icon: MessageSquare, label: 'Quotes' },
  { to: '/samples', icon: Package, label: 'Samples' },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/notifications', icon: Bell, label: 'Notifications', badge: true },
  { to: '/archive', icon: Archive, label: 'Archive' },
]

const ADMIN_NAV = [
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const { user, signOut } = useAuth()
  const unread = useUnreadCount()

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full bg-card border-r border-border flex flex-col transition-all duration-200',
          'md:relative md:z-auto',
          collapsed ? 'w-14' : 'w-56',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center gap-2 px-3 py-4 border-b border-border shrink-0', collapsed && 'justify-center px-0')}>
          {collapsed ? (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">R</div>
          ) : (
            <img src="/logo.webp" alt="Redantex" className="h-7 object-contain" />
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0 ml-1">
              <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">Impo RDX</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => setShowSearch(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Search (⌘K)"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label, badge, exact }) => (
            <SidebarLink
              key={to}
              to={to}
              icon={<Icon className="h-4 w-4 shrink-0" />}
              label={label}
              collapsed={collapsed}
              badge={badge && unread > 0 ? unread : undefined}
              exact={exact}
            />
          ))}

          {user?.role === 'admin' && (
            <>
              <div className={cn('mx-1 my-2 h-px bg-border', collapsed && 'mx-2')} />
              {ADMIN_NAV.map(({ to, icon: Icon, label }) => (
                <SidebarLink
                  key={to}
                  to={to}
                  icon={<Icon className="h-4 w-4 shrink-0" />}
                  label={label}
                  collapsed={collapsed}
                />
              ))}
            </>
          )}
        </nav>

        {/* User + collapse */}
        <div className="border-t border-border p-2 space-y-1 shrink-0">
          {user && (
            <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md', collapsed && 'justify-center px-0')}>
              <Avatar name={user.full_name} imageUrl={user.avatar_url} size="sm" />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{user.full_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate capitalize">{user.role}</p>
                </div>
              )}
              {!collapsed && (
                <button onClick={signOut} className="text-muted-foreground hover:text-foreground p-1 rounded" title="Sign out">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center justify-center h-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors hidden md:flex"
          >
            {collapsed
              ? <ChevronRight className="h-4 w-4" />
              : <><ChevronLeft className="h-4 w-4" /><span className="text-xs ml-1">Collapse</span></>
            }
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Sits in the empty space beside the page title rather than in a bar
            of its own, which would cost every page a strip of height. */}
        <Clocks className="hidden md:flex absolute top-3 right-5 z-20 bg-card/85 backdrop-blur-sm
                           rounded-lg border border-border px-3.5 py-2 shadow-sm" />

        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <button onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-semibold text-sm flex-1">Impo RDX</p>
          <button onClick={() => setShowSearch(true)} className="text-muted-foreground hover:text-foreground">
            <Search className="h-5 w-5" />
          </button>
        </div>

        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {showSearch && <Spotlight onClose={() => setShowSearch(false)} />}
    </div>
  )
}

function SidebarLink({
  to,
  icon,
  label,
  collapsed,
  badge,
  exact,
}: {
  to: string
  icon: ReactNode
  label: string
  collapsed: boolean
  badge?: number
  exact?: boolean
}) {
  const { pathname } = useLocation()
  const isActive = exact ? pathname === to : pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors group relative',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        collapsed && 'justify-center px-0'
      )}
      title={collapsed ? label : undefined}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
      {badge !== undefined && (
        <span className={cn(
          'ml-auto bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
          collapsed && 'absolute -top-0.5 -right-0.5 min-w-0 px-1 py-0 text-[9px]'
        )}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}
