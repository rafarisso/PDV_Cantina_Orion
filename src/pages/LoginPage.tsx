import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/state/AuthContext'

const LoginPage = () => {
  const { signIn, isDemo, configError } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const nextRole = await signIn(email, password)
      if (nextRole === 'guardian') navigate('/portal', { replace: true })
      else if (nextRole === 'operator') navigate('/pdv', { replace: true })
      else navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (configError) {
    return (
      <div className="app-shell" style={{ maxWidth: 520, paddingTop: 80 }}>
        <div className="card">
          <div className="card-title">Configuracao incompleta</div>
          <p className="muted">
            Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para login em producao ou habilite VITE_DEMO=true para
            testar sem backend.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" style={{ maxWidth: 520, paddingTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <img src="/logo-orion.png" alt="Cantina Órion" className="logo-mark" />
      </div>
      <div className="card">
        <div className="card-title">Acesso seguro</div>
        <p className="muted">Use credenciais do Supabase Auth. Este acesso valida seu papel antes de entrar.</p>
        <form onSubmit={handleLogin} className="grid" style={{ marginTop: 14, gap: 12 }}>
          <div className="field">
            <label>Email institucional</label>
            <input
              className="input"
              type="email"
              required={!isDemo}
              placeholder="admin@orion.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              className="input"
              type="password"
              required={!isDemo}
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="pill danger">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        {isDemo && <div className="muted">Modo demo ativo apenas por configuracao explicita (VITE_DEMO=true).</div>}
      </div>
    </div>
  )
}

export default LoginPage
