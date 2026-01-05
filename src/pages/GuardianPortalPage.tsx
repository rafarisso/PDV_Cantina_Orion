import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/state/AuthContext'
import { useData } from '@/state/DataContext'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { Guardian, Wallet } from '@/types/domain'

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
  const { orders, createPixCharge } = useData()
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<StudentAssignment[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [guardian, setGuardian] = useState<Guardian | null>(null)
  const [amount, setAmount] = useState<number>(20)
  const [note, setNote] = useState('Credito para consumo')
  const [message, setMessage] = useState<string | null>(null)
  const [fiadoMessage, setFiadoMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [guardianLoading, setGuardianLoading] = useState(Boolean(supabase))
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<{ fullName: string; grade: string; period: 'morning' | 'afternoon'; observations: string }>({
    fullName: '',
    grade: '',
    period: 'morning',
    observations: '',
  })
  const [creating, setCreating] = useState(false)

  const loadGuardian = async () => {
    setError(null)
    setNeedsOnboarding(false)
    if (env.configError || !supabase) {
      setGuardian(null)
      setAssignments([])
      setSelectedStudentId(null)
      setError('Supabase nao configurado')
      setGuardianLoading(false)
      return
    }
    if (!user?.id) {
      setGuardian(null)
      setGuardianLoading(false)
      return
    }
    setGuardianLoading(true)
    const { data, error: guardianError } = await supabase
      .from('guardians')
      .select('id, full_name, phone, cpf, address, terms_version, terms_accepted_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (guardianError) {
      setError(`Falha ao carregar responsavel: ${guardianError.message}`)
      setGuardian(null)
      setGuardianLoading(false)
      return
    }
    if (!data) {
      setGuardian(null)
      setAssignments([])
      setSelectedStudentId(null)
      setNeedsOnboarding(true)
      setGuardianLoading(false)
      return
    }
    setGuardian({
      id: data.id,
      fullName: data.full_name,
      phone: data.phone,
      cpf: data.cpf,
      address: data.address,
      termsAcceptedAt: data.terms_accepted_at ?? undefined,
      termsVersion: data.terms_version ?? undefined,
    })
    setGuardianLoading(false)
  }

  const loadAssignments = async (guardianId: string) => {
    setError(null)
    if (env.configError || !supabase) {
      setAssignments([])
      setSelectedStudentId(null)
      setError('Supabase nao configurado')
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
      .eq('guardian_id', guardianId)
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
  }

  useEffect(() => {
    void loadGuardian()
  }, [role, user?.id])

  useEffect(() => {
    if (guardian?.id) {
      void loadAssignments(guardian.id)
    }
  }, [guardian?.id])

  useEffect(() => {
    if (!loading && assignments.length === 0 && guardian && !needsOnboarding) {
      setCreateOpen(true)
    }
  }, [assignments.length, guardian, loading, needsOnboarding])

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

  const handleCreateStudent = async () => {
    if (!createDraft.fullName || !createDraft.grade) {
      setError('Informe nome e turma.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      if (!supabase) {
        throw new Error('Supabase nao configurado')
      }
      if (!guardian?.id) {
        throw new Error('Cadastro do responsavel nao localizado. Complete o cadastro antes de adicionar alunos.')
      }
      // Guardian creates a student tied to their own account.
      const { data, error: insertError } = await supabase
        .from('students')
        .insert({
          full_name: createDraft.fullName,
          grade: createDraft.grade,
          period: createDraft.period,
          guardian_id: guardian.id,
          status: 'active',
          pricing_model: 'prepaid',
          observations: createDraft.observations || null,
        })
        .select('id')
        .maybeSingle()
      if (insertError) throw insertError
      if (!data?.id) throw new Error('Aluno nao criado')
      setCreateDraft({ fullName: '', grade: '', period: 'morning', observations: '' })
      setCreateOpen(false)
      await loadAssignments(guardian.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (role !== 'guardian') {
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
          <h3 style={{ margin: 0 }}>Painel do responsavel</h3>
          <span className="muted">Adicionar creditos ou acompanhar fiado autorizado</span>
        </div>
        {guardianLoading && <div className="muted">Carregando cadastro do responsavel...</div>}
        {!guardianLoading && needsOnboarding && (
          <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="section-title">
              <h3 style={{ margin: 0 }}>Cadastro pendente</h3>
              <span className="muted">Precisamos confirmar seus dados para liberar o portal.</span>
            </div>
            <p className="muted">Complete o cadastro do responsavel para acessar os alunos e as carteiras.</p>
            <button className="btn btn-primary" onClick={() => navigate('/painel-do-responsavel/cadastro')}>
              Completar cadastro
            </button>
          </div>
        )}
        {loading && <div className="muted">Carregando carteira...</div>}
        {error && <div className="pill danger">{error}</div>}
        <div className="chips" style={{ marginBottom: 8 }}>
          <button
            className="btn"
            onClick={() => setCreateOpen(true)}
            disabled={needsOnboarding || guardianLoading}
          >
            Cadastrar aluno
          </button>
        </div>
        {!loading && !guardianLoading && !needsOnboarding && assignments.length === 0 && (
          <div className="muted">Nenhum aluno associado a esta conta.</div>
        )}
        {!loading && !guardianLoading && !needsOnboarding && assignments.length > 0 && (
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

            {selected?.wallet?.model === 'prepaid' ? (
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
            ) : (
              <div className="card">
                <div className="section-title">
                  <h3 style={{ margin: 0 }}>Creditos</h3>
                  <span className="muted">Carteira em modo fiado</span>
                </div>
                <p className="muted">Para este aluno, as compras seguem o limite definido pela escola.</p>
              </div>
            )}

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

            {selected && (
              <div className="card">
                <div className="section-title">
                  <h3 style={{ margin: 0 }}>Historico de consumo</h3>
                  <span className="muted">Ultimas movimentacoes deste aluno</span>
                </div>
                <ul className="list">
                  {orders
                    .filter((o) => o.studentId === selected.student.id)
                    .slice(0, 10)
                    .map((order) => (
                      <li key={order.id} className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <strong>{formatCurrency(order.total)}</strong>
                        <div className="muted">{order.items.map((i) => `${i.quantity}x ${i.productId}`).join(', ')}</div>
                        <small className="muted">{formatDateTime(order.createdAt)}</small>
                      </li>
                    ))}
                  {orders.filter((o) => o.studentId === selected.student.id).length === 0 && (
                    <li className="muted">Sem compras registradas.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {createOpen && guardian && !needsOnboarding && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="section-title">
              <h3 style={{ margin: 0 }}>Cadastrar aluno</h3>
              <span className="muted">Vinculado automaticamente a este responsavel</span>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              <div className="field">
                <label>Nome completo</label>
                <input
                  className="input"
                  value={createDraft.fullName}
                  onChange={(e) => setCreateDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Turma/serie</label>
                <input
                  className="input"
                  value={createDraft.grade}
                  onChange={(e) => setCreateDraft((prev) => ({ ...prev, grade: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Periodo</label>
                <select
                  className="input"
                  value={createDraft.period}
                  onChange={(e) => setCreateDraft((prev) => ({ ...prev, period: e.target.value as 'morning' | 'afternoon' }))}
                >
                  <option value="morning">Manha</option>
                  <option value="afternoon">Tarde</option>
                </select>
              </div>
              <div className="field">
                <label>Observacoes</label>
                <textarea
                  className="input"
                  value={createDraft.observations}
                  onChange={(e) => setCreateDraft((prev) => ({ ...prev, observations: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="chips">
                <button className="btn" onClick={() => void handleCreateStudent()} disabled={creating}>
                  {creating ? 'Salvando...' : 'Salvar'}
                </button>
                <button className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default GuardianPortalPage
