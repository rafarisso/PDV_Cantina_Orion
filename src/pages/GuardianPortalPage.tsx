import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/state/AuthContext'
import { useData } from '@/state/DataContext'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import { formatCurrency } from '@/lib/format'
import type { Wallet } from '@/types/domain'

interface StudentAssignment {
  student: {
    id: string
    fullName: string
    grade: string
    period: string
    guardianId: string
  }
  wallet?: Wallet
}

const GuardianPortalPage = () => {
  const { role, user } = useAuth()
  const { students, wallets, guardians, createPixCharge } = useData()
  const [assignments, setAssignments] = useState<StudentAssignment[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [amount, setAmount] = useState<number>(20)
  const [note, setNote] = useState('Credito para consumo')
  const [message, setMessage] = useState<string | null>(null)
  const [fiadoMessage, setFiadoMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!env.isDemo && Boolean(supabase))

  useEffect(() => {
    const load = async () => {
      setError(null)
      if (env.configError || (!supabase && !env.isDemo)) {
        setAssignments([])
        setSelectedStudentId(null)
        setError('Supabase nao configurado')
        setLoading(false)
        return
      }
      if (supabase && !env.isDemo) {
        if (!user?.id) {
          setAssignments([])
          setLoading(false)
          return
        }
        setLoading(true)
        const { data, error: queryError } = await supabase
          .from('students')
          .select(
            `
            id,
            full_name,
            grade,
            period,
            guardian_id,
            wallets:wallets (
              id,
              balance,
              credit_limit,
              model,
              allow_negative_once_used,
              blocked,
              blocked_reason,
              alert_baseline,
              last_alert_level
            )
          `,
          )
          .eq('guardian_id', user.id)
        if (queryError) {
          setError(queryError.message)
          setLoading(false)
          return
        }
        const mapped: StudentAssignment[] =
          data?.map((row: any) => {
            const walletRel = Array.isArray(row.wallets) ? row.wallets[0] : row.wallets
            const wallet: Wallet | undefined = walletRel
              ? {
                  id: walletRel.id,
                  studentId: row.id,
                  balance: Number(walletRel.balance ?? 0),
                  creditLimit: Number(walletRel.credit_limit ?? 0),
                  model: walletRel.model,
                  allowNegativeOnceUsed: Boolean(walletRel.allow_negative_once_used),
                  blocked: Boolean(walletRel.blocked),
                  blockedReason: walletRel.blocked_reason ?? undefined,
                  alertBaseline: walletRel.alert_baseline ?? undefined,
                  lastAlertLevel: walletRel.last_alert_level ?? undefined,
                }
              : undefined
            return {
              student: {
                id: row.id,
                fullName: row.full_name,
                grade: row.grade,
                period: row.period,
                guardianId: row.guardian_id,
              },
              wallet,
            }
          }) ?? []
        setAssignments(mapped)
        setSelectedStudentId(mapped[0]?.student.id ?? null)
        setLoading(false)
        return
      }

      // Demo / offline fallback
      const guardianId = guardians[0]?.id
      const mapped = students
        .filter((s) => !guardianId || s.guardianId === guardianId)
        .map((student) => ({
          student: {
            id: student.id,
            fullName: student.fullName,
            grade: student.grade,
            period: student.period,
            guardianId: student.guardianId,
          },
          wallet: wallets.find((w) => w.studentId === student.id),
        }))
      setAssignments(mapped)
      setSelectedStudentId(mapped[0]?.student.id ?? null)
      setLoading(false)
    }

    void load()
  }, [role, user?.id, students, wallets, guardians])

  const selected = useMemo(
    () => assignments.find((item) => item.student.id === selectedStudentId),
    [assignments, selectedStudentId],
  )

  const available =
    selected?.wallet?.model === 'prepaid'
      ? selected?.wallet?.balance ?? 0
      : Math.max((selected?.wallet?.creditLimit ?? 0) - (selected?.wallet?.balance ?? 0), 0)

  const canUseFiado =
    selected?.wallet?.model === 'postpaid' && Number(selected.wallet?.creditLimit ?? 0) > 0

  const handleTopup = async () => {
    if (!selected?.wallet) {
      setError('Carteira nao encontrada para este aluno.')
      return
    }
    setError(null)
    setMessage(null)
    setFiadoMessage(null)
    try {
      const charge = await createPixCharge({
        guardianId: selected.student.guardianId,
        studentId: selected.student.id,
        amount,
        description: note,
      })
      setMessage(
        charge.brCode
          ? `Pix gerado (${charge.txid}). Copie e cole no aplicativo bancario.`
          : `Credito solicitado (${charge.txid}). Aguarde confirmacao do pagamento.`,
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleFiado = () => {
    if (!selected?.wallet) return
    setFiadoMessage(
      `Fiado habilitado. Limite disponivel: ${formatCurrency(
        Math.max(selected.wallet.creditLimit - selected.wallet.balance, 0),
      )}. Compras presenciais no PDV seguem este limite.`,
    )
  }

  if (role !== 'guardian' && role !== 'admin') {
    return (
      <div className="card">
        <div className="card-title">Acesso restrito</div>
        <p className="muted">Esta area e exclusiva para responsaveis.</p>
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Portal do responsavel</h3>
          <span className="muted">Adicionar creditos ou acompanhar fiado autorizado</span>
        </div>
        {loading && <div className="muted">Carregando carteira...</div>}
        {error && <div className="pill danger">{error}</div>}
        {!loading && assignments.length === 0 && (
          <div className="muted">Nenhum aluno associado a esta conta.</div>
        )}
        {!loading && assignments.length > 0 && (
          <div className="grid" style={{ gap: 12 }}>
            <div className="field">
              <label>Aluno</label>
              <select
                className="input"
                value={selectedStudentId ?? ''}
                onChange={(e) => setSelectedStudentId(e.target.value)}
              >
                {assignments.map((item) => (
                  <option key={item.student.id} value={item.student.id}>
                    {item.student.fullName} · {item.student.grade} ({item.student.period})
                  </option>
                ))}
              </select>
            </div>
            {selected?.wallet && (
              <div className="card">
                <div className="section-title">
                  <h3 style={{ margin: 0 }}>Carteira</h3>
                  <span className="muted">
                    {selected.wallet.model === 'prepaid' ? 'Pre-pago' : 'Fiado'} ·{' '}
                    {selected.wallet.blocked ? 'Bloqueado' : 'Ativo'}
                  </span>
                </div>
                <div className="chips">
                  <span className="pill">
                    {selected.wallet.model === 'prepaid'
                      ? `Saldo: ${formatCurrency(selected.wallet.balance)}`
                      : `Disponivel: ${formatCurrency(available)} de ${formatCurrency(selected.wallet.creditLimit)}`}
                  </span>
                  {selected.wallet.blocked && (
                    <span className="pill danger">Motivo: {selected.wallet.blockedReason ?? 'Financeiro'}</span>
                  )}
                </div>
              </div>
            )}

            <div className="card">
              <div className="section-title">
                <h3 style={{ margin: 0 }}>Adicionar creditos</h3>
                <span className="muted">Sempre via Pix seguro</span>
              </div>
              <div className="grid grid-cols-2" style={{ gap: 12 }}>
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
                <div className="field">
                  <label>Descricao</label>
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              {message && <div className="pill positive">{message}</div>}
              <button className="btn btn-primary" onClick={() => void handleTopup()} disabled={!selectedStudentId}>
                Gerar Pix
              </button>
            </div>

            {canUseFiado && (
              <div className="card">
                <div className="section-title">
                  <h3 style={{ margin: 0 }}>Compra fiado</h3>
                  <span className="muted">Disponivel apenas se liberado pela escola</span>
                </div>
                <p className="muted">
                  Fiado habilitado para este aluno. O limite definido pela administracao se aplica a compras presenciais.
                </p>
                {fiadoMessage && <div className="pill positive">{fiadoMessage}</div>}
                <button className="btn" type="button" onClick={handleFiado}>
                  Confirmar uso de fiado
                </button>
              </div>
            )}
            {!canUseFiado && selected && (
              <div className="card">
                <div className="section-title">
                  <h3 style={{ margin: 0 }}>Fiado indisponivel</h3>
                  <span className="muted">Disponivel somente quando a escola habilita limite</span>
                </div>
                <p className="muted">Adicione creditos para liberar as compras deste aluno.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default GuardianPortalPage
