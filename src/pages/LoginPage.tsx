import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/state/AuthContext'

const LoginPage = () => {
  const { signIn, isDemo, configError, authError } = useAuth()
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
            Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para habilitar o login.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" style={{ maxWidth: 560, paddingTop: 64 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <img src="/logo-orion.png" alt="Cantina Órion" className="logo-mark" style={{ width: 96, height: 96 }} />
      </div>
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div className="brand" style={{ fontSize: 22, marginBottom: 6 }}>
            Cantina Orion
          </div>
          <div className="muted">Acesso seguro ao PDV e ao portal do aluno.</div>
        </div>
        <div className="card-title">Entrar</div>
        <form onSubmit={handleLogin} className="grid" style={{ marginTop: 14, gap: 12 }}>
          <div className="field">
            <label>Email institucional</label>
            <input
              className="input"
              type="email"
              required
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
              required
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="pill danger">{error}</div>}
          {authError && <div className="pill danger">{authError}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <div className="divider" />
        <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="card-title">Pai ou responsavel</div>
          <p className="muted">Cadastre-se para acompanhar o consumo do aluno e adicionar creditos.</p>
          <button className="btn" type="button" onClick={() => navigate('/guardian-onboarding')}>
            Sou pai ou responsavel
          </button>
        </div>
        {isDemo && <div className="muted">Modo demo ativo apenas por configuracao explicita (VITE_DEMO=true).</div>}
      </div>
    </div>
  )
}

export default LoginPage
