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

type SignupStudent = {
  id: string
  fullName: string
  grade: string
  period: 'morning' | 'afternoon'
  observations: string
}

const createStudentDraft = (): SignupStudent => ({
  id: crypto.randomUUID(),
  fullName: '',
  grade: '',
  period: 'morning',
  observations: '',
})

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
  const [students, setStudents] = useState<SignupStudent[]>([createStudentDraft()])
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

  const updateStudent = (id: string, patch: Partial<SignupStudent>) => {
    setStudents((prev) => prev.map((student) => (student.id === id ? { ...student, ...patch } : student)))
  }

  const addStudent = () => {
    setStudents((prev) => [...prev, createStudentDraft()])
  }

  const removeStudent = (id: string) => {
    setStudents((prev) => (prev.length > 1 ? prev.filter((student) => student.id !== id) : prev))
  }

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

    const normalizedStudents = students
      .map((student) => ({
        fullName: student.fullName.trim(),
        grade: student.grade.trim(),
        period: student.period,
        observations: student.observations.trim(),
      }))
      .filter((student) => student.fullName || student.grade || student.observations)
    if (normalizedStudents.length === 0) {
      setError('Informe pelo menos um aluno.')
      return
    }
    if (normalizedStudents.some((student) => !student.fullName || !student.grade)) {
      setError('Preencha nome e serie para cada aluno.')
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
            students: normalizedStudents,
          },
          emailRedirectTo: redirectTo,
        },
      })
      if (signUpError) throw signUpError
      if (!data.user) {
        throw new Error('Nao foi possivel criar a conta.')
      }

      if (data.session) {
        const payload = {
          user_id: data.user.id,
          full_name: form.fullName.trim(),
          cpf: onlyDigits(form.cpf),
          phone: phoneDigits,
          cep: onlyDigits(form.cep),
          street: form.street,
          number: form.number,
          complement: form.complement || null,
          neighborhood: form.neighborhood,
          city: form.city,
          state: form.state,
          address,
          accepted_terms: true,
          accepted_at: new Date().toISOString(),
          accepted_ip: acceptedIp ?? null,
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        }

        let guardianId: string | null = null
        const { data: guardian, error: guardianError } = await supabase
          .from('guardians')
          .insert(payload)
          .select('id')
          .maybeSingle()
        if (guardianError) {
          const errorCode = (guardianError as { code?: string }).code
          if (errorCode === '23505') {
            const { data: claimedId, error: claimError } = await supabase.rpc('claim_guardian_by_cpf', {
              p_cpf: onlyDigits(form.cpf),
            })
            if (claimError || !claimedId) {
              throw new Error('CPF ja cadastrado. Solicite a vinculacao do administrador.')
            }
            const { error: updateError } = await supabase.from('guardians').update(payload).eq('id', claimedId)
            if (updateError) throw updateError
            guardianId = claimedId
          } else {
            throw guardianError
          }
        } else {
          guardianId = guardian?.id ?? null
        }

        if (!guardianId) {
          throw new Error('Cadastro do responsavel nao localizado.')
        }

        for (const student of normalizedStudents) {
          const { error: insertError } = await supabase.from('students').insert({
            guardian_id: guardianId,
            full_name: student.fullName,
            grade: student.grade,
            period: student.period,
            status: 'active',
            pricing_model: 'prepaid',
            observations: student.observations || null,
          })
          if (insertError) throw insertError
        }

        setSuccess('Conta criada e alunos cadastrados. Voce ja pode acessar o portal.')
      } else {
        setSuccess(
          'Conta criada. Verifique seu email para confirmar o cadastro. Os alunos informados serao cadastrados no primeiro acesso.',
        )
      }
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
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="section-title">
                <h4 style={{ margin: 0 }}>Alunos vinculados</h4>
                <span className="muted">Cadastre ao menos um aluno nesta etapa.</span>
              </div>
              <div className="grid" style={{ gap: 12 }}>
                {students.map((student, index) => (
                  <div key={student.id} className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="section-title">
                      <h4 style={{ margin: 0 }}>Aluno {index + 1}</h4>
                      <span className="muted">Nome, serie e periodo</span>
                    </div>
                    <div className="grid grid-cols-2" style={{ gap: 12 }}>
                      <div className="field">
                        <label>Nome completo</label>
                        <input
                          className="input"
                          required
                          value={student.fullName}
                          onChange={(event) => updateStudent(student.id, { fullName: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Serie</label>
                        <input
                          className="input"
                          required
                          value={student.grade}
                          onChange={(event) => updateStudent(student.id, { grade: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Periodo</label>
                        <select
                          className="input"
                          value={student.period}
                          onChange={(event) =>
                            updateStudent(student.id, { period: event.target.value as 'morning' | 'afternoon' })
                          }
                        >
                          <option value="morning">Manha</option>
                          <option value="afternoon">Tarde</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Observacoes</label>
                        <input
                          className="input"
                          value={student.observations}
                          onChange={(event) => updateStudent(student.id, { observations: event.target.value })}
                        />
                      </div>
                    </div>
                    <div className="chips" style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => removeStudent(student.id)}
                        disabled={students.length === 1}
                      >
                        Remover aluno
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="chips" style={{ marginTop: 12 }}>
                <button className="btn" type="button" onClick={addStudent}>
                  Adicionar outro aluno
                </button>
              </div>
            </div>
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
