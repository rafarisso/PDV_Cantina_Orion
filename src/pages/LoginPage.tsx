import { useState } from 'react'
import { useAuth } from '@/state/AuthContext'

const LoginPage = () => {
  const { signIn, isDemo, setRole } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 520, paddingTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <img src="/logo-orion.png" alt="Cantina Órion" className="logo-mark" />
      </div>
      <div className="card">
        <div className="card-title">Acesso seguro</div>
        <p className="muted">
          Use credenciais do Supabase Auth. No modo demo voce pode entrar sem email para explorar o fluxo.
        </p>
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
        {isDemo && (
          <>
            <div className="divider" />
            <div className="chips">
              <button
                className="btn"
                onClick={() => {
                  setRole('admin')
                  void signIn('', '')
                }}
              >
                Entrar como admin (demo)
              </button>
              <button
                className="btn"
                onClick={() => {
                  setRole('operator')
                  void signIn('', '')
                }}
              >
                Entrar como operador (demo)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LoginPage
