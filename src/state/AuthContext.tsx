import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import { type SessionUser, type UserRole } from '@/types/domain'

interface AuthContextValue {
  user: SessionUser | null
  role: UserRole
  loading: boolean
  isDemo: boolean
  configError: boolean
  signIn: (email: string, password: string) => Promise<UserRole>
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
  const [role, setRoleState] = useState<UserRole>(env.isDemo ? 'admin' : 'operator')
  const [loading, setLoading] = useState(!env.isDemo)

  const loadRole = async (userId: string): Promise<UserRole> => {
    if (!supabase) throw new Error('Supabase nao configurado')
    const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
    if (error) {
      console.warn('Falha ao carregar papel do usuario', error.message)
      throw error
    }
    if (!data?.role) {
      throw new Error('Papel nao encontrado para o usuario')
    }
    return data.role as UserRole
  }

  useEffect(() => {
    if (env.configError) {
      setLoading(false)
      setUser(null)
      return
    }

    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const sessionUser = data.session?.user
        if (sessionUser) {
          loadRole(sessionUser.id)
            .then((userRole) => {
              setRoleState(userRole)
              setUser({
                id: sessionUser.id,
                email: sessionUser.email ?? undefined,
                role: userRole,
                fullName: sessionUser.user_metadata?.full_name,
              })
            })
            .catch(() => {
              setUser(null)
            })
        }
      })
      .finally(() => setLoading(false))

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) {
        loadRole(session.user.id)
          .then((userRole) => {
            setRoleState(userRole)
            setUser({
              id: session.user.id,
              email: session.user.email ?? undefined,
              role: userRole,
              fullName: session.user.user_metadata?.full_name,
            })
          })
          .catch(() => {
            setUser(null)
          })
      } else {
        setUser(env.isDemo ? DEMO_USER : null)
      }
    })

    return () => listener?.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    if (env.configError) {
      throw new Error('Configuracao Supabase ausente. Verifique variaveis de ambiente.')
    }
    if (env.isDemo && !supabase) {
      setUser(DEMO_USER)
      setRoleState('admin')
      return 'admin'
    }
    if (!supabase) {
      throw new Error('Servicos indisponiveis')
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const sessionUser = data.user
    const resolvedRole = await loadRole(sessionUser.id)
    setRoleState(resolvedRole)
    setUser({
      id: sessionUser.id,
      email: sessionUser.email ?? undefined,
      role: resolvedRole,
      fullName: sessionUser.user_metadata?.full_name,
    })
    return resolvedRole
  }

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(env.isDemo ? DEMO_USER : null)
    if (!env.isDemo) {
      setRoleState('operator')
    }
  }

  const setRole = (nextRole: UserRole) => {
    if (!env.isDemo) return
    setRoleState(nextRole)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      loading,
      isDemo: env.isDemo,
      configError: env.configError,
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
