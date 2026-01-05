import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import { type SessionUser, type UserRole } from '@/types/domain'

interface AuthContextValue {
  user: SessionUser | null
  role: UserRole | null
  loading: boolean
  isDemo: boolean
  configError: boolean
  authError: string | null
  signIn: (email: string, password: string) => Promise<UserRole>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [role, setRoleState] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  // Role is resolved via RPC to avoid direct user_roles selects.
  const loadRole = async (): Promise<UserRole> => {
    const client = supabase
    if (!client) throw new Error('Supabase nao configurado')
    const { data, error } = await client.rpc('get_my_role')
    if (error) {
      console.warn('Falha ao carregar papel do usuario', error.message)
      throw error
    }
    const resolvedRole = data as UserRole | null
    if (!resolvedRole || !['admin', 'operator', 'guardian'].includes(resolvedRole)) {
      throw new Error('Papel nao encontrado para o usuario')
    }
    return resolvedRole
  }

  useEffect(() => {
    if (env.configError) {
      setLoading(false)
      setUser(null)
      setRoleState(null)
      return
    }

    const client = supabase
    if (!client) {
      setLoading(false)
      return
    }

    client.auth
      .getSession()
      .then(({ data }) => {
        const sessionUser = data.session?.user
        if (sessionUser) {
        loadRole()
          .then((userRole) => {
            setRoleState(userRole)
            setUser({
              id: sessionUser.id,
              email: sessionUser.email ?? undefined,
              role: userRole,
              fullName: sessionUser.user_metadata?.full_name,
            })
            setAuthError(null)
          })
          .catch((err) => {
            console.warn('Falha ao carregar papel', err)
            setAuthError('Falha ao validar papel do usuario')
            void client.auth.signOut()
            setUser(null)
            setRoleState(null)
          })
        }
      })
      .finally(() => setLoading(false))

    const { data: listener } = client.auth.onAuthStateChange((_, session) => {
      if (session?.user) {
        loadRole()
          .then((userRole) => {
            setRoleState(userRole)
            setUser({
              id: session.user.id,
              email: session.user.email ?? undefined,
              role: userRole,
              fullName: session.user.user_metadata?.full_name,
            })
            setAuthError(null)
          })
          .catch((err) => {
            console.warn('Falha ao carregar papel', err)
            setAuthError('Falha ao validar papel do usuario')
            void client.auth.signOut()
            setUser(null)
            setRoleState(null)
          })
      } else {
        setUser(null)
        setRoleState(null)
      }
    })

    return () => listener?.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    if (env.configError) {
      throw new Error('Configuracao Supabase ausente. Verifique variaveis de ambiente.')
    }
    if (!supabase) {
      throw new Error('Servicos indisponiveis')
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const sessionUser = data.user
    let resolvedRole: UserRole
    try {
      resolvedRole = await loadRole()
    } catch (err) {
      setAuthError('Papel invalido para este usuario')
      await supabase.auth.signOut()
      throw new Error('Papel invalido para este usuario')
    }
    setRoleState(resolvedRole)
    setUser({
      id: sessionUser.id,
      email: sessionUser.email ?? undefined,
      role: resolvedRole,
      fullName: sessionUser.user_metadata?.full_name,
    })
    setAuthError(null)
    return resolvedRole
  }

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setRoleState(null)
    setAuthError(null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      loading,
      isDemo: env.isDemo,
      configError: env.configError,
      authError,
      signIn,
      signOut,
    }),
    [authError, loading, role, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
