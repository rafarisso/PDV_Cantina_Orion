import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/state/AuthContext'
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

type PendingStudent = {
  fullName: string
  grade: string
  period: 'morning' | 'afternoon'
  observations: string
}

const GuardianOnboardingPage = () => {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardianId, setGuardianId] = useState<string | null>(null)
  const [studentCount, setStudentCount] = useState(0)
  const [pendingStudents, setPendingStudents] = useState<PendingStudent[]>([])
  const [importingStudents, setImportingStudents] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [existingAcceptedAt, setExistingAcceptedAt] = useState<string | null>(null)
  const [existingAcceptedIp, setExistingAcceptedIp] = useState<string | null>(null)
  const [lastCepLookup, setLastCepLookup] = useState<string | null>(null)
  const [cepFeedback, setCepFeedback] = useState<string | null>(null)
  const [guardianForm, setGuardianForm] = useState({
    fullName: '',
    email: '',
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
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    grade: '',
    period: 'morning',
    photo: null as File | null,
  })
  const [savingStudent, setSavingStudent] = useState(false)

  const loadGuardian = async () => {
    setError(null)
    if (!supabase || !user?.id) {
      setChecking(false)
      return
    }
    setChecking(true)
    const { data: authData } = await supabase.auth.getUser()
    const metadata = authData.user?.user_metadata ?? {}
    const email = authData.user?.email ?? ''
    const metaAcceptedAt = typeof metadata.accepted_at === 'string' ? metadata.accepted_at : null
    const metaAcceptedIp = typeof metadata.accepted_ip === 'string' ? metadata.accepted_ip : null

    const { data: guardian, error: guardianError } = await supabase
      .from('guardians')
      .select(
        'id, full_name, cpf, phone, cep, street, number, complement, neighborhood, city, state, accepted_terms, accepted_at, accepted_ip, address',
      )
      .eq('user_id', user.id)
      .maybeSingle()
    if (guardianError) {
      setError(`Falha ao carregar cadastro: ${guardianError.message}`)
      setChecking(false)
      return
    }

    const address = (guardian?.address ?? metadata.address ?? {}) as {
      zipCode?: string
      street?: string
      number?: string
      complement?: string
      neighborhood?: string
      city?: string
      state?: string
    }

    setGuardianId(guardian?.id ?? null)
    setExistingAcceptedAt(guardian?.accepted_at ?? metaAcceptedAt ?? null)
    setExistingAcceptedIp(guardian?.accepted_ip ?? metaAcceptedIp ?? null)
    setGuardianForm({
      fullName: guardian?.full_name ?? metadata.full_name ?? '',
      email,
      cpf: formatCpf(guardian?.cpf ?? metadata.cpf ?? ''),
      phone: formatPhone(guardian?.phone ?? metadata.phone ?? ''),
      cep: formatCep(guardian?.cep ?? metadata.cep ?? address.zipCode ?? ''),
      street: guardian?.street ?? metadata.street ?? address.street ?? '',
      number: guardian?.number ?? metadata.number ?? address.number ?? '',
      complement: guardian?.complement ?? metadata.complement ?? address.complement ?? '',
      neighborhood: guardian?.neighborhood ?? metadata.neighborhood ?? address.neighborhood ?? '',
      city: guardian?.city ?? metadata.city ?? address.city ?? '',
      state: guardian?.state ?? metadata.state ?? address.state ?? '',
      terms: Boolean(guardian?.accepted_terms ?? metadata.accepted_terms ?? false),
    })

    const pendingFromMeta = Array.isArray(metadata.students) ? metadata.students : []
    const normalizedPending = pendingFromMeta
      .map((student: any) => ({
        fullName: String(student?.fullName ?? student?.full_name ?? '').trim(),
        grade: String(student?.grade ?? '').trim(),
        period: student?.period === 'afternoon' ? 'afternoon' : 'morning',
        observations: String(student?.observations ?? '').trim(),
      }))
      .filter((student) => student.fullName && student.grade)

    let nextStudentCount = 0
    if (guardian?.id) {
      const { count } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('guardian_id', guardian.id)
      nextStudentCount = count ?? 0
      setStudentCount(nextStudentCount)
    } else {
      setStudentCount(0)
    }
    if (guardian?.id) {
      setPendingStudents(nextStudentCount === 0 ? normalizedPending : [])
    } else {
      setPendingStudents(normalizedPending)
    }
    setChecking(false)
  }

  useEffect(() => {
    if (role === 'guardian') {
      void loadGuardian()
    }
  }, [role, user?.id])

  useEffect(() => {
    const cepDigits = onlyDigits(guardianForm.cep)
    if (cepDigits.length !== 8 || cepDigits === lastCepLookup) return
    setLastCepLookup(cepDigits)
    setCepFeedback('Buscando endereco pelo CEP...')
    fetchAddressByCep(cepDigits)
      .then((address) => {
        if (!address) {
          setCepFeedback('CEP nao encontrado.')
          return
        }
        setGuardianForm((prev) => ({
          ...prev,
          street: prev.street || address.street,
          neighborhood: prev.neighborhood || address.neighborhood,
          city: prev.city || address.city,
          state: prev.state || address.state,
        }))
        setCepFeedback(null)
      })
      .catch(() => setCepFeedback('Falha ao consultar o CEP.'))
  }, [guardianForm.cep, lastCepLookup])

  const guardianComplete =
    guardianForm.fullName &&
    guardianForm.cpf &&
    guardianForm.phone &&
    guardianForm.cep &&
    guardianForm.street &&
    guardianForm.number &&
    guardianForm.neighborhood &&
    guardianForm.city &&
    guardianForm.state &&
    guardianForm.terms &&
    isValidCpf(guardianForm.cpf)

  const importPending = async (targetGuardianId: string, studentsToCreate: PendingStudent[]) => {
    if (!supabase) {
      setError('Supabase nao configurado.')
      return
    }
    if (!studentsToCreate.length) return
    setImportingStudents(true)
    setImportMessage(null)
    try {
      for (const student of studentsToCreate) {
        const { error: insertError } = await supabase.from('students').insert({
          guardian_id: targetGuardianId,
          full_name: student.fullName,
          grade: student.grade,
          period: student.period,
          status: 'active',
          pricing_model: 'prepaid',
          observations: student.observations || null,
        })
        if (insertError) throw insertError
      }
      setPendingStudents([])
      setStudentCount((prev) => prev + studentsToCreate.length)
      setImportMessage('Alunos cadastrados a partir do cadastro inicial.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setImportingStudents(false)
    }
  }

  const handleSaveGuardian = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!supabase || !user?.id) {
      setError('Usuario nao autenticado.')
      return
    }
    if (!guardianComplete) {
      setError('Preencha todos os dados obrigatorios corretamente.')
      return
    }
    setLoading(true)
    try {
      setImportMessage(null)
      const acceptedAt = existingAcceptedAt ?? new Date().toISOString()
      const acceptedIp = existingAcceptedIp ?? (await fetchPublicIp())
      const address = {
        street: guardianForm.street,
        number: guardianForm.number,
        complement: guardianForm.complement,
        neighborhood: guardianForm.neighborhood,
        city: guardianForm.city,
        state: guardianForm.state,
        zipCode: onlyDigits(guardianForm.cep),
      }
      const payload = {
        user_id: user.id,
        full_name: guardianForm.fullName.trim(),
        cpf: onlyDigits(guardianForm.cpf),
        phone: onlyDigits(guardianForm.phone),
        cep: onlyDigits(guardianForm.cep),
        street: guardianForm.street,
        number: guardianForm.number,
        complement: guardianForm.complement || null,
        neighborhood: guardianForm.neighborhood,
        city: guardianForm.city,
        state: guardianForm.state,
        address,
        accepted_terms: true,
        accepted_at: acceptedAt,
        accepted_ip: acceptedIp ?? null,
        terms_version: TERMS_VERSION,
        terms_accepted_at: acceptedAt,
      }
      let nextGuardianId = guardianId
      if (guardianId) {
        const { error: updateError } = await supabase.from('guardians').update(payload).eq('id', guardianId)
        if (updateError) throw updateError
      } else {
        const { data, error: insertError } = await supabase.from('guardians').insert(payload).select('id').maybeSingle()
        if (insertError) {
          const errorCode = (insertError as { code?: string }).code
          if (errorCode === '23505') {
            const { data: claimedId, error: claimError } = await supabase.rpc('claim_guardian_by_cpf', {
              p_cpf: onlyDigits(guardianForm.cpf),
            })
            if (claimError || !claimedId) {
              throw new Error('CPF ja cadastrado. Solicite ao administrador a vinculacao da conta.')
            }
            const { error: updateError } = await supabase.from('guardians').update(payload).eq('id', claimedId)
            if (updateError) throw updateError
            setGuardianId(claimedId)
            nextGuardianId = claimedId
          } else {
            throw insertError
          }
        } else {
          setGuardianId(data?.id ?? null)
          nextGuardianId = data?.id ?? null
        }
      }
      const studentsToImport = pendingStudents
      if (nextGuardianId && studentsToImport.length > 0 && studentCount === 0) {
        await importPending(nextGuardianId, studentsToImport)
      }
      await loadGuardian()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleStudentSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!supabase || !guardianId) {
      setError('Cadastro do responsavel nao localizado.')
      return
    }
    if (!studentForm.fullName || !studentForm.grade) {
      setError('Informe nome e serie do aluno.')
      return
    }
    setSavingStudent(true)
    try {
      const studentId = crypto.randomUUID()
      let photoUrl: string | null = null
      if (studentForm.photo) {
        const extension = studentForm.photo.name.split('.').pop() ?? 'jpg'
        const photoPath = `guardians/${guardianId}/${studentId}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('student-photos')
          .upload(photoPath, studentForm.photo, { upsert: true })
        if (uploadError) throw uploadError
        const { data: publicUrl } = supabase.storage.from('student-photos').getPublicUrl(photoPath)
        photoUrl = publicUrl.publicUrl
      }
      const { error: insertError } = await supabase.from('students').insert({
        id: studentId,
        guardian_id: guardianId,
        full_name: studentForm.fullName,
        grade: studentForm.grade,
        period: studentForm.period,
        status: 'active',
        pricing_model: 'prepaid',
        photo_url: photoUrl,
      })
      if (insertError) throw insertError
      setStudentForm({ fullName: '', grade: '', period: 'morning', photo: null })
      setStudentCount((prev) => prev + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingStudent(false)
    }
  }

  if (!user) {
    return (
      <div className="app-shell" style={{ maxWidth: 640, paddingTop: 64 }}>
        <div className="card">
          <div className="card-title">Acesso restrito</div>
          <p className="muted">Faca login para continuar.</p>
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
    <div className="app-shell" style={{ maxWidth: 860, paddingTop: 48 }}>
      <div className="grid" style={{ gap: 16 }}>
        <section className="card">
          <div className="section-title">
            <h3 style={{ margin: 0 }}>Etapa 1 - Dados do responsavel</h3>
            <span className="muted">Preencha os dados obrigatorios para liberar o acesso.</span>
          </div>
          {checking && <div className="muted">Carregando cadastro...</div>}
          {error && <div className="pill danger">{error}</div>}
          <form onSubmit={handleSaveGuardian} className="grid grid-cols-2" style={{ gap: 12 }}>
            <div className="field">
              <label>Nome completo</label>
              <input
                className="input"
                required
                value={guardianForm.fullName}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, fullName: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" value={guardianForm.email} disabled />
            </div>
            <div className="field">
              <label>CPF</label>
              <input
                className="input"
                required
                value={guardianForm.cpf}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, cpf: formatCpf(event.target.value) }))}
              />
            </div>
            <div className="field">
              <label>Telefone (WhatsApp)</label>
              <input
                className="input"
                required
                value={guardianForm.phone}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, phone: formatPhone(event.target.value) }))}
              />
            </div>
            <div className="field">
              <label>CEP</label>
              <input
                className="input"
                required
                value={guardianForm.cep}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, cep: formatCep(event.target.value) }))}
              />
              {cepFeedback && <div className="muted">{cepFeedback}</div>}
            </div>
            <div className="field">
              <label>Logradouro</label>
              <input
                className="input"
                required
                value={guardianForm.street}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, street: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Numero</label>
              <input
                className="input"
                required
                value={guardianForm.number}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, number: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Complemento</label>
              <input
                className="input"
                value={guardianForm.complement}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, complement: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Bairro</label>
              <input
                className="input"
                required
                value={guardianForm.neighborhood}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, neighborhood: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Cidade</label>
              <input
                className="input"
                required
                value={guardianForm.city}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, city: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Estado (UF)</label>
              <input
                className="input"
                required
                maxLength={2}
                value={guardianForm.state}
                onChange={(event) =>
                  setGuardianForm((prev) => ({ ...prev, state: event.target.value.toUpperCase() }))
                }
              />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: '1 / -1' }}>
              <input
                type="checkbox"
                checked={guardianForm.terms}
                onChange={(event) => setGuardianForm((prev) => ({ ...prev, terms: event.target.checked }))}
                required
              />
              Li e aceito os Termos de Uso e a Politica de Privacidade, conforme a LGPD, e autorizo o uso dos meus
              dados para fins de controle de consumo escolar e cobranca.
            </label>
            <div className="chips" style={{ gridColumn: '1 / -1' }}>
              <button className="btn btn-primary" type="submit" disabled={loading || checking}>
                {loading ? 'Salvando...' : 'Salvar dados'}
              </button>
            </div>
          </form>
        </section>

        {guardianComplete && (
          <section className="card">
            <div className="section-title">
              <h3 style={{ margin: 0 }}>Etapa 2 - Cadastro do aluno</h3>
              <span className="muted">Cadastre o primeiro aluno para liberar o painel.</span>
            </div>
            {importingStudents && <div className="muted">Cadastrando alunos informados...</div>}
            {importMessage && <div className="pill positive">{importMessage}</div>}
            {studentCount > 0 ? (
              <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="muted">Cadastro concluido. Voce ja possui aluno cadastrado.</p>
                <button className="btn btn-primary" onClick={() => navigate('/painel-do-responsavel')}>
                  Ir para o painel
                </button>
              </div>
            ) : (
              <form onSubmit={handleStudentSubmit} className="grid grid-cols-2" style={{ gap: 12 }}>
                <div className="field">
                  <label>Nome completo do aluno</label>
                  <input
                    className="input"
                    required
                    value={studentForm.fullName}
                    onChange={(event) => setStudentForm((prev) => ({ ...prev, fullName: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Serie</label>
                  <input
                    className="input"
                    required
                    value={studentForm.grade}
                    onChange={(event) => setStudentForm((prev) => ({ ...prev, grade: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Periodo</label>
                  <select
                    className="input"
                    value={studentForm.period}
                    onChange={(event) => setStudentForm((prev) => ({ ...prev, period: event.target.value }))}
                  >
                    <option value="morning">Manha</option>
                    <option value="afternoon">Tarde</option>
                  </select>
                </div>
                <div className="field">
                  <label>Foto do aluno (opcional)</label>
                  <input
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setStudentForm((prev) => ({
                        ...prev,
                        photo: event.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </div>
                <div className="chips" style={{ gridColumn: '1 / -1' }}>
                  <button className="btn btn-primary" type="submit" disabled={savingStudent}>
                    {savingStudent ? 'Salvando...' : 'Cadastrar aluno'}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default GuardianOnboardingPage
