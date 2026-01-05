import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/state/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import type { Address } from '@/types/domain'

const TERMS_VERSION = '2025-01'

const emptyAddress: Address = {
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: '',
  zipCode: '',
  complement: '',
}

const GuardianOnboardingPage = () => {
  const { user, role, configError } = useAuth()
  const navigate = useNavigate()
  const [draft, setDraft] = useState({
    fullName: '',
    phone: '',
    cpf: '',
    address: emptyAddress,
    terms: false,
  })
  const [checking, setChecking] = useState(Boolean(supabase))
  const [loading, setLoading] = useState(false)
  const [hasGuardian, setHasGuardian] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadGuardian = async () => {
    setError(null)
    setHasGuardian(false)
    if (configError || !supabase) {
      setChecking(false)
      setError('Supabase nao configurado')
      return
    }
    if (!user?.id) {
      setChecking(false)
      return
    }
    setChecking(true)
    const { data, error: guardianError } = await supabase
      .from('guardians')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (guardianError) {
      setError(`Falha ao verificar cadastro: ${guardianError.message}`)
      setChecking(false)
      return
    }
    setHasGuardian(Boolean(data?.id))
    setChecking(false)
  }

  useEffect(() => {
    void loadGuardian()
  }, [user?.id])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!supabase) {
      setError('Supabase nao configurado')
      return
    }
    if (!user?.id) {
      setError('Usuario nao autenticado. Faca login para continuar.')
      return
    }
    if (role !== 'guardian') {
      setError('Acesso restrito ao papel de responsavel.')
      return
    }
    if (
      !draft.fullName ||
      !draft.phone ||
      !draft.cpf ||
      !draft.address.zipCode ||
      !draft.address.street ||
      !draft.address.number ||
      !draft.address.neighborhood ||
      !draft.address.city ||
      !draft.address.state
    ) {
      setError('Preencha todos os campos obrigatorios.')
      return
    }
    if (!draft.terms) {
      setError('Aceite os termos para continuar.')
      return
    }
    setLoading(true)
    try {
      const { data, error: insertError } = await supabase
        .from('guardians')
        .insert({
          user_id: user.id,
          full_name: draft.fullName,
          phone: draft.phone,
          cpf: draft.cpf,
          address: draft.address,
          terms_version: TERMS_VERSION,
        })
        .select('id')
        .maybeSingle()
      if (insertError) throw insertError
      if (!data?.id) throw new Error('Cadastro nao foi concluido.')
      await loadGuardian()
      navigate('/painel-do-responsavel', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (configError) {
    return (
      <div className="app-shell" style={{ maxWidth: 640, paddingTop: 64 }}>
        <div className="card">
          <div className="card-title">Configuracao incompleta</div>
          <p className="muted">Defina as variaveis do Supabase para habilitar o cadastro.</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-shell" style={{ maxWidth: 620, paddingTop: 64 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <img src="/logo-orion.png" alt="Cantina Orion" className="logo-mark" style={{ width: 88, height: 88 }} />
          </div>
          <div className="card-title">Portal do responsavel</div>
          <p className="muted">
            Este acesso permite acompanhar o consumo do aluno, ver saldo e adicionar creditos com Pix seguro.
          </p>
          <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <strong>Como funciona</strong>
            <ol style={{ marginTop: 8 }}>
              <li>Solicite o acesso ao portal com a escola.</li>
              <li>Entre com suas credenciais e complete o cadastro.</li>
              <li>Acompanhe o consumo e recarregue a carteira quando precisar.</li>
            </ol>
          </div>
          <div className="chips" style={{ marginTop: 14 }}>
            <Link to="/" className="btn btn-primary">
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (role !== 'guardian') {
    return (
      <div className="app-shell" style={{ maxWidth: 640, paddingTop: 64 }}>
        <div className="card">
          <div className="card-title">Acesso restrito</div>
          <p className="muted">Este cadastro e exclusivo para responsaveis.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 720, margin: '0 auto' }}>
      <section className="card">
        <div className="card-title">Cadastro do responsavel</div>
        <p className="muted">Confirme seus dados para liberar o acesso ao portal do aluno.</p>
        {checking && <div className="muted">Verificando cadastro...</div>}
        {error && <div className="pill danger">{error}</div>}
        {hasGuardian ? (
          <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="muted">Seu cadastro ja esta completo.</p>
            <button className="btn btn-primary" onClick={() => navigate('/painel-do-responsavel')}>
              Ir para o portal
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-2" style={{ gap: 12 }}>
            <div className="field">
              <label>Nome completo</label>
              <input
                className="input"
                required
                value={draft.fullName}
                onChange={(event) => setDraft((prev) => ({ ...prev, fullName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Telefone (WhatsApp)</label>
              <input
                className="input"
                required
                value={draft.phone}
                onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>CPF</label>
              <input
                className="input"
                required
                value={draft.cpf}
                onChange={(event) => setDraft((prev) => ({ ...prev, cpf: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>CEP</label>
              <input
                className="input"
                required
                value={draft.address.zipCode}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, address: { ...prev.address, zipCode: event.target.value } }))
                }
              />
            </div>
            <div className="field">
              <label>Rua</label>
              <input
                className="input"
                required
                value={draft.address.street}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, address: { ...prev.address, street: event.target.value } }))
                }
              />
            </div>
            <div className="field">
              <label>Numero</label>
              <input
                className="input"
                required
                value={draft.address.number}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, address: { ...prev.address, number: event.target.value } }))
                }
              />
            </div>
            <div className="field">
              <label>Bairro</label>
              <input
                className="input"
                required
                value={draft.address.neighborhood}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, address: { ...prev.address, neighborhood: event.target.value } }))
                }
              />
            </div>
            <div className="field">
              <label>Cidade</label>
              <input
                className="input"
                required
                value={draft.address.city}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, address: { ...prev.address, city: event.target.value } }))
                }
              />
            </div>
            <div className="field">
              <label>Estado</label>
              <input
                className="input"
                required
                value={draft.address.state}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, address: { ...prev.address, state: event.target.value } }))
                }
              />
            </div>
            <div className="field">
              <label>Complemento</label>
              <input
                className="input"
                value={draft.address.complement}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, address: { ...prev.address, complement: event.target.value } }))
                }
              />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={draft.terms}
                onChange={(event) => setDraft((prev) => ({ ...prev, terms: event.target.checked }))}
                required
              />
              Confirmo aceite dos termos e consentimentos (LGPD)
            </label>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Concluir cadastro'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

export default GuardianOnboardingPage
