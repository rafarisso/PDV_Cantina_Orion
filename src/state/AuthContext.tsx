import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import { type SessionUser, type UserRole } from '@/types/domain'

interface AuthContextValue {
  user: SessionUser | null
  role: UserRole
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setRole: (role: UserRole) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEMO_USER: SessionUser = {
  id: 'demo-admin',
  email: 'demo@orion.app',
  role: 'admin',
  fullName: 'Administrador (demo)',
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SessionUser | null>(env.isDemo ? DEMO_USER : null)
  const [role, setRole] = useState<UserRole>(env.isDemo ? 'admin' : 'operator')
  const [loading, setLoading] = useState(!env.isDemo)

  const loadRole = async (userId: string): Promise<UserRole> => {
    if (!supabase) return 'admin'
    const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
    if (error) {
      console.warn('Falha ao carregar papel do usuario', error.message)
      return role
    }
    return (data?.role as UserRole) ?? role
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const sessionUser = data.session?.user
        if (sessionUser) {
          loadRole(sessionUser.id).then((userRole) => {
            setRole(userRole)
            setUser({
              id: sessionUser.id,
              email: sessionUser.email ?? undefined,
              role: userRole,
              fullName: sessionUser.user_metadata?.full_name,
            })
          })
        }
      })
      .finally(() => setLoading(false))

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) {
        loadRole(session.user.id).then((userRole) => {
          setRole(userRole)
          setUser({
            id: session.user.id,
            email: session.user.email ?? undefined,
            role: userRole,
            fullName: session.user.user_metadata?.full_name,
          })
        })
      } else {
        setUser(env.isDemo ? DEMO_USER : null)
      }
    })

    return () => listener?.subscription.unsubscribe()
  }, [role])

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      setUser(DEMO_USER)
      setRole('admin')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const sessionUser = data.user
    const resolvedRole = await loadRole(sessionUser.id)
    setRole(resolvedRole)
    setUser({
      id: sessionUser.id,
      email: sessionUser.email ?? undefined,
      role: resolvedRole,
      fullName: sessionUser.user_metadata?.full_name,
    })
  }

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(env.isDemo ? DEMO_USER : null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      loading,
      isDemo: env.isDemo,
      signIn,
      signOut,
      setRole,
    }),
    [loading, role, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
