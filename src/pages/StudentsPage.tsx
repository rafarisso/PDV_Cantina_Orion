import { useMemo, useState } from 'react'
import { z } from 'zod'
import { useData } from '@/state/DataContext'
import { formatCurrency, maskCpf } from '@/lib/format'

const guardianSchema = z.object({
  fullName: z.string().min(3),
  phone: z.string().min(8),
  cpf: z.string().min(11),
  address: z.object({
    street: z.string().min(3),
    number: z.string().min(1),
    neighborhood: z.string().min(2),
    city: z.string().min(2),
    state: z.string().min(2),
    zipCode: z.string().min(5),
    complement: z.string().optional(),
  }),
  terms: z.boolean().refine((val) => val === true, { message: 'Aceite dos termos e obrigatorio' }),
})

const studentSchema = z.object({
  fullName: z.string().min(3),
  grade: z.string().min(2),
  period: z.enum(['morning', 'afternoon']),
  status: z.enum(['active', 'inactive']),
  pricingModel: z.enum(['prepaid', 'postpaid']),
  creditLimit: z.number().nonnegative(),
})

const StudentsPage = () => {
  const { guardians, students, wallets, registerGuardian, registerStudent } = useData()
  const [guardianForm, setGuardianForm] = useState({
    fullName: '',
    phone: '',
    cpf: '',
    address: { street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '', complement: '' },
    terms: false,
  })
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    grade: '',
    period: 'morning',
    status: 'active',
    pricingModel: 'prepaid',
    creditLimit: 0,
  })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const studentsWithWallet = useMemo(
    () =>
      students.map((student) => ({
        student,
        wallet: wallets.find((w) => w.studentId === student.id),
        guardian: guardians.find((g) => g.id === student.guardianId),
      })),
    [guardians, students, wallets],
  )

  const resetForms = () => {
    setGuardianForm({
      fullName: '',
      phone: '',
      cpf: '',
      address: { street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '', complement: '' },
      terms: false,
    })
    setStudentForm({
      fullName: '',
      grade: '',
      period: 'morning',
      status: 'active',
      pricingModel: 'prepaid',
      creditLimit: 0,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFeedback(null)

    try {
      const guardianData = guardianSchema.parse(guardianForm)
      const studentData = studentSchema.parse({
        ...studentForm,
        creditLimit: Number(studentForm.creditLimit),
      })

      const guardianId = crypto.randomUUID()
      const studentId = crypto.randomUUID()
      registerGuardian({
        id: guardianId,
        fullName: guardianData.fullName,
        phone: guardianData.phone,
        cpf: guardianData.cpf,
        address: guardianData.address,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: '2025-01',
      })
      registerStudent(
        {
          id: studentId,
          guardianId,
          fullName: studentData.fullName,
          grade: studentData.grade,
          period: studentData.period,
          status: studentData.status,
          pricingModel: studentData.pricingModel,
        },
        {
          creditLimit: studentData.pricingModel === 'postpaid' ? studentData.creditLimit : 0,
          alertBaseline: studentData.pricingModel === 'prepaid' ? studentData.creditLimit || 50 : studentData.creditLimit,
        },
      )
      setFeedback('Cadastro concluido. Aluno ja possui carteira e controle de saldo.')
      resetForms()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Cadastro de aluno e responsavel</h3>
          <span className="muted">Campos obrigatorios. Sem cadastro incompleto.</span>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Nome do responsavel</label>
            <input
              className="input"
              required
              value={guardianForm.fullName}
              onChange={(e) => setGuardianForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Telefone (WhatsApp)</label>
            <input
              className="input"
              required
              value={guardianForm.phone}
              onChange={(e) => setGuardianForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>CPF</label>
            <input
              className="input"
              required
              value={guardianForm.cpf}
              onChange={(e) => setGuardianForm((f) => ({ ...f, cpf: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>CEP</label>
            <input
              className="input"
              required
              value={guardianForm.address.zipCode}
              onChange={(e) => setGuardianForm((f) => ({ ...f, address: { ...f.address, zipCode: e.target.value } }))}
            />
          </div>
          <div className="field">
            <label>Rua</label>
            <input
              className="input"
              required
              value={guardianForm.address.street}
              onChange={(e) => setGuardianForm((f) => ({ ...f, address: { ...f.address, street: e.target.value } }))}
            />
          </div>
          <div className="field">
            <label>Numero</label>
            <input
              className="input"
              required
              value={guardianForm.address.number}
              onChange={(e) => setGuardianForm((f) => ({ ...f, address: { ...f.address, number: e.target.value } }))}
            />
          </div>
          <div className="field">
            <label>Bairro</label>
            <input
              className="input"
              required
              value={guardianForm.address.neighborhood}
              onChange={(e) =>
                setGuardianForm((f) => ({ ...f, address: { ...f.address, neighborhood: e.target.value } }))
              }
            />
          </div>
          <div className="field">
            <label>Cidade</label>
            <input
              className="input"
              required
              value={guardianForm.address.city}
              onChange={(e) => setGuardianForm((f) => ({ ...f, address: { ...f.address, city: e.target.value } }))}
            />
          </div>
          <div className="field">
            <label>Estado</label>
            <input
              className="input"
              required
              value={guardianForm.address.state}
              onChange={(e) => setGuardianForm((f) => ({ ...f, address: { ...f.address, state: e.target.value } }))}
            />
          </div>
          <div className="field">
            <label>Complemento</label>
            <input
              className="input"
              value={guardianForm.address.complement}
              onChange={(e) =>
                setGuardianForm((f) => ({ ...f, address: { ...f.address, complement: e.target.value } }))
              }
            />
          </div>

          <div className="field">
            <label>Nome do aluno</label>
            <input
              className="input"
              required
              value={studentForm.fullName}
              onChange={(e) => setStudentForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Serie/ano</label>
            <input
              className="input"
              required
              value={studentForm.grade}
              onChange={(e) => setStudentForm((f) => ({ ...f, grade: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Periodo</label>
            <select
              className="input"
              value={studentForm.period}
              onChange={(e) => setStudentForm((f) => ({ ...f, period: e.target.value }))}
            >
              <option value="morning">Manha</option>
              <option value="afternoon">Tarde</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select
              className="input"
              value={studentForm.status}
              onChange={(e) => setStudentForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div className="field">
            <label>Modelo financeiro</label>
            <select
              className="input"
              value={studentForm.pricingModel}
              onChange={(e) => setStudentForm((f) => ({ ...f, pricingModel: e.target.value }))}
            >
              <option value="prepaid">Pre-pago (saldo)</option>
              <option value="postpaid">Fiado com limite</option>
            </select>
          </div>
          <div className="field">
            <label>Limite (apenas fiado)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={studentForm.creditLimit}
              onChange={(e) => setStudentForm((f) => ({ ...f, creditLimit: Number(e.target.value) }))}
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={guardianForm.terms}
              onChange={(e) => setGuardianForm((f) => ({ ...f, terms: e.target.checked }))}
              required
            />
            Confirmo aceite dos termos e consentimentos (LGPD)
          </label>
          {error && <div className="pill danger">{error}</div>}
          {feedback && <div className="pill positive">{feedback}</div>}
          <button className="btn btn-primary" type="submit">
            Salvar cadastro
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Alunos cadastrados</h3>
          <span className="muted">CPF mascarado para operadores</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Responsavel</th>
              <th>Modelo</th>
              <th>Saldo/Limite</th>
            </tr>
          </thead>
          <tbody>
            {studentsWithWallet.map(({ student, wallet, guardian }) => (
              <tr key={student.id}>
                <td>
                  <strong>{student.fullName}</strong>
                  <div className="muted">
                    {student.grade} · {student.period === 'morning' ? 'manha' : 'tarde'}
                  </div>
                </td>
                <td>
                  {guardian?.fullName} ({maskCpf(guardian?.cpf ?? '', false)})
                  <div className="muted">{guardian?.phone}</div>
                </td>
                <td>{student.pricingModel === 'prepaid' ? 'Pre-pago' : 'Fiado'}</td>
                <td>
                  {wallet
                    ? wallet.model === 'prepaid'
                      ? formatCurrency(wallet.balance)
                      : `${formatCurrency(wallet.balance)} de ${formatCurrency(wallet.creditLimit)}`
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default StudentsPage
