import { useState } from 'react'
import { useData } from '@/state/DataContext'
import { formatCurrency, formatDateTime } from '@/lib/format'

const BillingPage = () => {
  const { students, guardians, createPixCharge, pixCharges } = useData()
  const [studentId, setStudentId] = useState<string>(students[0]?.id ?? '')
  const [amount, setAmount] = useState<number>(20)
  const [note, setNote] = useState('Credito para consumo')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    setError(null)
    const student = students.find((s) => s.id === studentId)
    if (!student) return
    setLoading(true)
    try {
      const charge = await createPixCharge({
        guardianId: student.guardianId,
        studentId,
        amount,
        description: note,
      })
      setMessage(
        charge.brCode
          ? `Cobranca criada (${charge.txid}). Copie e envie o codigo Pix para o responsavel.`
          : `Cobranca criada (${charge.txid}). Gere payload copia-e-cola via function /api/pix/create e envie ao responsavel.`,
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Gerar Pix copia-e-cola</h3>
          <span className="muted">Integra PagSeguro via Netlify Function</span>
        </div>
        <div className="grid grid-cols-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Aluno</label>
            <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((s) => {
                const guardian = guardians.find((g) => g.id === s.guardianId)
                return (
                  <option key={s.id} value={s.id}>
                    {s.fullName} — Resp.: {guardian?.fullName}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="field">
            <label>Valor</label>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Descricao</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {message && <div className="pill positive">{message}</div>}
          {error && <div className="pill danger">{error}</div>}
          <button className="btn btn-primary" type="button" onClick={handleCreate} disabled={loading}>
            {loading ? 'Gerando...' : 'Criar cobranca Pix'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          POST /api/pix/create recebe aluno/responsavel, chama PagSeguro e retorna payload copia-e-cola. Webhook /api/pix/webhook
          confirma pagamento e desbloqueia aluno automaticamente.
        </p>
      </section>

      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Cobrancas geradas</h3>
          <span className="muted">Aguardando PagSeguro</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Criado</th>
            </tr>
          </thead>
          <tbody>
            {pixCharges.map((charge) => {
              const student = students.find((s) => s.id === charge.studentId)
              return (
                <tr key={charge.id}>
                  <td>{student?.fullName}</td>
                  <td>{formatCurrency(charge.amount)}</td>
                  <td>
                    <span className="pill">{charge.status}</span>
                  </td>
                  <td>{formatDateTime(charge.createdAt)}</td>
                </tr>
              )
            })}
            {pixCharges.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nenhuma cobranca criada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default BillingPage
