import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import {
  fetchAddressByCep,
  fetchPublicIp,
  formatCep,
  formatCpf,
  formatPhone,
  isValidCpf,
  onlyDigits,
} from '@/lib/guardianForm'

const TERMS_VERSION = '2025-01'

const GuardianSignupPage = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    cpf: '',
    phone: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    terms: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastCepLookup, setLastCepLookup] = useState<string | null>(null)
  const [cepFeedback, setCepFeedback] = useState<string | null>(null)

  useEffect(() => {
    const cepDigits = onlyDigits(form.cep)
    if (cepDigits.length !== 8 || cepDigits === lastCepLookup) return
    setLastCepLookup(cepDigits)
    setCepFeedback('Buscando endereco pelo CEP...')
    fetchAddressByCep(cepDigits)
      .then((address) => {
        if (!address) {
          setCepFeedback('CEP nao encontrado.')
          return
        }
        setForm((prev) => ({
          ...prev,
          street: prev.street || address.street,
          neighborhood: prev.neighborhood || address.neighborhood,
          city: prev.city || address.city,
          state: prev.state || address.state,
        }))
        setCepFeedback(null)
      })
      .catch(() => setCepFeedback('Falha ao consultar o CEP.'))
  }, [form.cep, lastCepLookup])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    if (env.configError || !supabase) {
      setError('Supabase nao configurado')
      return
    }
    if (
      !form.fullName ||
      !form.email ||
      !form.password ||
      !form.cpf ||
      !form.phone ||
      !form.cep ||
      !form.street ||
      !form.number ||
      !form.neighborhood ||
      !form.city ||
      !form.state
    ) {
      setError('Preencha todos os campos obrigatorios.')
      return
    }
    if (!isValidCpf(form.cpf)) {
      setError('CPF invalido.')
      return
    }
    const phoneDigits = onlyDigits(form.phone)
    if (phoneDigits.length < 10) {
      setError('Telefone invalido.')
      return
    }
    if (!form.terms) {
      setError('Aceite os termos para continuar.')
      return
    }

    setLoading(true)
    try {
      const acceptedIp = await fetchPublicIp()
      const address = {
        street: form.street,
        number: form.number,
        complement: form.complement,
        neighborhood: form.neighborhood,
        city: form.city,
        state: form.state,
        zipCode: onlyDigits(form.cep),
      }
      const redirectTo = env.appBaseUrl ? `${env.appBaseUrl}/painel-do-responsavel/cadastro` : undefined
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            app_role: 'guardian',
            full_name: form.fullName.trim(),
            cpf: onlyDigits(form.cpf),
            phone: phoneDigits,
            cep: onlyDigits(form.cep),
            street: form.street,
            number: form.number,
            complement: form.complement,
            neighborhood: form.neighborhood,
            city: form.city,
            state: form.state,
            accepted_terms: true,
            accepted_at: new Date().toISOString(),
            accepted_ip: acceptedIp ?? undefined,
            terms_version: TERMS_VERSION,
            address,
          },
          emailRedirectTo: redirectTo,
        },
      })
      if (signUpError) throw signUpError
      if (!data.user) {
        throw new Error('Nao foi possivel criar a conta.')
      }
      setSuccess('Conta criada. Verifique seu email para confirmar o cadastro.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (env.configError) {
    return (
      <div className="app-shell" style={{ maxWidth: 640, paddingTop: 64 }}>
        <div className="card">
          <div className="card-title">Configuracao incompleta</div>
          <p className="muted">Defina as variaveis do Supabase para habilitar o cadastro.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" style={{ maxWidth: 760, paddingTop: 64 }}>
      <div className="card">
        <div className="card-title">Cadastro do responsavel</div>
        <p className="muted">Cadastre-se para acompanhar o consumo do aluno e adicionar creditos com seguranca.</p>
        {error && <div className="pill danger">{error}</div>}
        {success && (
          <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="muted">{success}</p>
            <div className="chips">
              <button className="btn btn-primary" onClick={() => navigate('/')}>
                Voltar ao login
              </button>
            </div>
          </div>
        )}
        {!success && (
          <form onSubmit={handleSubmit} className="grid grid-cols-2" style={{ gap: 12 }}>
            <div className="field">
              <label>Nome completo</label>
              <input
                className="input"
                required
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Senha</label>
              <input
                className="input"
                type="password"
                required
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>CPF</label>
              <input
                className="input"
                required
                value={form.cpf}
                onChange={(event) => setForm((prev) => ({ ...prev, cpf: formatCpf(event.target.value) }))}
              />
            </div>
            <div className="field">
              <label>Telefone (WhatsApp)</label>
              <input
                className="input"
                required
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: formatPhone(event.target.value) }))}
              />
            </div>
            <div className="field">
              <label>CEP</label>
              <input
                className="input"
                required
                value={form.cep}
                onChange={(event) => setForm((prev) => ({ ...prev, cep: formatCep(event.target.value) }))}
              />
              {cepFeedback && <div className="muted">{cepFeedback}</div>}
            </div>
            <div className="field">
              <label>Logradouro</label>
              <input
                className="input"
                required
                value={form.street}
                onChange={(event) => setForm((prev) => ({ ...prev, street: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Numero</label>
              <input
                className="input"
                required
                value={form.number}
                onChange={(event) => setForm((prev) => ({ ...prev, number: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Complemento</label>
              <input
                className="input"
                value={form.complement}
                onChange={(event) => setForm((prev) => ({ ...prev, complement: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Bairro</label>
              <input
                className="input"
                required
                value={form.neighborhood}
                onChange={(event) => setForm((prev) => ({ ...prev, neighborhood: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Cidade</label>
              <input
                className="input"
                required
                value={form.city}
                onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Estado (UF)</label>
              <input
                className="input"
                required
                maxLength={2}
                value={form.state}
                onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value.toUpperCase() }))}
              />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: '1 / -1' }}>
              <input
                type="checkbox"
                checked={form.terms}
                onChange={(event) => setForm((prev) => ({ ...prev, terms: event.target.checked }))}
                required
              />
              Li e aceito os Termos de Uso e a Politica de Privacidade, conforme a LGPD, e autorizo o uso dos meus
              dados para fins de controle de consumo escolar e cobranca.
            </label>
            <div className="chips" style={{ gridColumn: '1 / -1' }}>
              <button className="btn btn-primary" type="submit" disabled={loading || !form.terms}>
                {loading ? 'Criando conta...' : 'Criar conta'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => navigate('/')}>
                Voltar ao login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default GuardianSignupPage
