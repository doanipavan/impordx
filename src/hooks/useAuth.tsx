import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { User } from '../types'

interface AuthContextType {
  session: Session | null
  supabaseUser: SupabaseUser | null
  user: User | null
  loading: boolean
  /** Chegou por um link de recuperação e ainda não escolheu a senha nova. */
  recovery: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * O link de recuperação chega como `#type=recovery&access_token=…`.
 *
 * Lido aqui, na importação, e não só pelo evento `PASSWORD_RECOVERY`: o
 * supabase-js limpa o hash assim que troca o token por uma sessão, e essa
 * sessão é uma sessão como outra qualquer — sem esta marca o hub abriria
 * normalmente e a pessoa que veio justamente trocar a senha nunca veria a
 * tela para trocá-la.
 */
const chegouPorRecuperacao = (() => {
  try {
    return new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
  } catch {
    return false
  }
})()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(chegouPorRecuperacao)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSupabaseUser(session?.user ?? null)
      if (session?.user) fetchUser(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setSession(session)
      setSupabaseUser(session?.user ?? null)
      if (session?.user) fetchUser(session.user.id)
      else { setUser(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchUser(id: string) {
    const { data } = await supabase.from('users').select('*').eq('id', id).single()
    if (data) setUser(data as User)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  /**
   * Manda o email com o link.
   *
   * Sem `redirectTo` de propósito: o Supabase usa a Site URL, que está sempre
   * na lista de endereços permitidos. Passar o endereço daqui faria o link
   * morrer em qualquer origem que não estivesse cadastrada à mão — e o erro
   * só apareceria para quem clicasse no email, longe de qualquer tela nossa.
   */
  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    return { error: error?.message ?? null }
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) setRecovery(false)
    return { error: error?.message ?? null }
  }

  async function updateProfile(updates: Partial<User>) {
    if (!user) return { error: 'Not authenticated' }
    const { error } = await supabase.from('users').update(updates).eq('id', user.id)
    if (!error) setUser({ ...user, ...updates })
    return { error: error?.message ?? null }
  }

  return (
    <AuthContext.Provider value={{
      session, supabaseUser, user, loading, recovery,
      signIn, signOut, updateProfile, resetPassword, updatePassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
