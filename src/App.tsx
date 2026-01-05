import { useLocation, useNavigate, Routes, Route, Navigate, Link } from 'react-router-dom'
import { useEffect, useMemo, type JSX } from 'react'
import { useAuth } from '@/state/AuthContext'
import DashboardPage from '@/pages/DashboardPage'
import POSPage from '@/pages/POSPage'
import StudentsPage from '@/pages/StudentsPage'
import BillingPage from '@/pages/BillingPage'
import LoginPage from '@/pages/LoginPage'
import AdminWalletsPage from '@/pages/AdminWalletsPage'
import GuardianPortalPage from '@/pages/GuardianPortalPage'
import { type UserRole } from '@/types/domain'
import { LogOut, Menu, PiggyBank, ShieldCheck, ShoppingBag, Wallet } from 'lucide-react'

const NAV_ITEMS: { path: string; label: string; roles: UserRole[]; icon: JSX.Element }[] = [
  { path: '/', label: 'Painel', roles: ['admin'], icon: <ShieldCheck size={16} /> },
  { path: '/pdv', label: 'PDV', roles: ['admin', 'operator'], icon: <ShoppingBag size={16} /> },
  { path: '/wallets', label: 'Carteiras', roles: ['admin'], icon: <Wallet size={16} /> },
  { path: '/students', label: 'Alunos', roles: ['admin'], icon: <Menu size={16} /> },
  { path: '/billing', label: 'Cobrancas Pix', roles: ['admin'], icon: <Menu size={16} /> },
  { path: '/portal', label: 'Responsavel', roles: ['guardian'], icon: <PiggyBank size={16} /> },
]

const App = () => {
  const { user, role, loading, signOut, isDemo, configError, authError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const availableNav = useMemo(
    () => NAV_ITEMS.filter((item) => item.roles.includes(role)),
    [role],
  )

  useEffect(() => {
    if (!user) return
    if (availableNav.length === 0) return
    const allowed = availableNav.some((item) => item.path === location.pathname)
    if (!allowed) {
      navigate(availableNav[0].path, { replace: true })
    }
  }, [availableNav, location.pathname, navigate, user])

  if (configError) {
    return (
      <div className="app-shell">
        <div className="card">
          <div className="card-title">Configuracao incompleta</div>
          <p className="muted">
            Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para executar em producao ou habilite o modo demo com
            VITE_DEMO=true.
          </p>
          {authError && <div className="pill danger">{authError}</div>}
        </div>
      </div>
    )
  }

  if (loading) return <div className="app-shell">Carregando...</div>
  if (!user) return <LoginPage />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link to="/">
              <img src="/logo-orion.png" alt="Cantina Órion" className="logo-mark" />
            </Link>
            <div className="brand">Cantina Orion</div>
          </div>
          <div className="chips">
            <span className="badge">PWA</span>
            <span className="badge">Supabase + PagSeguro</span>
            {isDemo && <span className="badge">Modo demo</span>}
            <span className="badge">Papel: {role}</span>
          </div>
        </div>
        <div className="chips">
          <button className="btn btn-ghost" onClick={() => signOut()}>
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </header>

      <nav className="nav">
        {availableNav.map((item) => (
          <button
            key={item.path}
            className={item.path === location.pathname ? 'active' : undefined}
            onClick={() => navigate(item.path)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <Routes>
        <Route
          path="/"
          element={
            <Protected roles={['admin']}>
              <DashboardPage />
            </Protected>
          }
        />
        <Route
          path="/pdv"
          element={
            <Protected roles={['admin', 'operator']}>
              <POSPage />
            </Protected>
          }
        />
        <Route
          path="/students"
          element={
            <Protected roles={['admin']}>
              <StudentsPage />
            </Protected>
          }
        />
        <Route
          path="/billing"
          element={
            <Protected roles={['admin']}>
              <BillingPage />
            </Protected>
          }
        />
        <Route
          path="/wallets"
          element={
            <Protected roles={['admin']}>
              <AdminWalletsPage />
            </Protected>
          }
        />
        <Route
          path="/portal"
          element={
            <Protected roles={['guardian', 'admin']}>
              <GuardianPortalPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <footer style={{ marginTop: 24 }} className="muted">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <small>LGPD: CPF mascarado para operadores.</small>
          <Link to="/students" className="badge">
            Cadastro completo
          </Link>
        </div>
      </footer>
    </div>
  )
}

const Protected = ({ roles, children }: { roles: UserRole[]; children: JSX.Element }) => {
  const { role, user } = useAuth()
  if (!user || !roles.includes(role)) {
    return (
      <div className="card">
        <div className="card-title">Acesso restrito</div>
        <p className="muted">Seu papel atual nao permite acessar esta area.</p>
      </div>
    )
  }
  return children
}

export default App
