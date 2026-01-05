import { useEffect, useState } from 'react'
import { useAuth } from '@/state/AuthContext'
import { useData } from '@/state/DataContext'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import { formatCurrency } from '@/lib/format'
import type { PricingModel, Wallet } from '@/types/domain'

type WalletRow = Wallet & {
  studentName?: string
  grade?: string
  period?: string
}

const mapWallet = (row: any): Wallet => ({
  id: row.id,
  studentId: row.student_id,
  balance: Number(row.balance ?? 0),
  creditLimit: Number(row.credit_limit ?? 0),
  model: row.model as PricingModel,
  allowNegativeOnceUsed: Boolean(row.allow_negative_once_used),
  blocked: Boolean(row.blocked),
  blockedReason: row.blocked_reason ?? undefined,
  alertBaseline: row.alert_baseline ?? undefined,
  lastAlertLevel: row.last_alert_level ?? undefined,
})

const AdminWalletsPage = () => {
  const { role } = useAuth()
  const { students, wallets: demoWallets, updateWalletModel } = useData()
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)
  const [limitDraft, setLimitDraft] = useState<Record<string, number>>({})

  const loadWallets = async () => {
    if (env.isDemo) {
      const fallback = demoWallets.map((wallet) => {
        const student = students.find((s) => s.id === wallet.studentId)
        return {
          ...wallet,
          studentName: student?.fullName,
          grade: student?.grade,
          period: student?.period,
        }
      })
      setWallets(fallback)
      setLimitDraft(
        fallback.reduce<Record<string, number>>((acc, w) => {
          acc[w.id] = w.creditLimit
          return acc
        }, {}),
      )
      setLoading(false)
      return
    }
    if (!supabase) {
      setError('Supabase nao configurado')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('wallets')
      .select(
        `
        id,
        student_id,
        balance,
        credit_limit,
        model,
        allow_negative_once_used,
        blocked,
        blocked_reason,
        alert_baseline,
        last_alert_level,
        students:student_id (
          full_name,
          grade,
          period
        )
      `,
      )
      .order('updated_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }

    const mapped: WalletRow[] =
      data?.map((row: any) => {
        const studentRel = Array.isArray(row.students) ? row.students[0] : row.students
        return {
          ...mapWallet(row),
          studentName: studentRel?.full_name,
          grade: studentRel?.grade,
          period: studentRel?.period,
        }
      }) ?? []

    setWallets(mapped)
    setLimitDraft(
      mapped.reduce<Record<string, number>>((acc, w) => {
        acc[w.id] = w.creditLimit
        return acc
      }, {}),
    )
    setLoading(false)
  }

  useEffect(() => {
    void loadWallets()
  }, [role])

  const persistModel = async (wallet: WalletRow, pricingModel: PricingModel, creditLimit: number) => {
    setError(null)
    if (supabase && !env.isDemo) {
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          model: pricingModel,
          credit_limit: creditLimit,
          blocked: pricingModel === 'prepaid' ? false : wallet.blocked,
          blocked_reason: pricingModel === 'prepaid' ? null : wallet.blockedReason ?? null,
        })
        .eq('id', wallet.id)
      if (updateError) {
        setError(updateError.message)
        return
      }
    }
    updateWalletModel({ studentId: wallet.studentId, pricingModel, creditLimit })
    await loadWallets()
  }

  const handleEnablePostpaid = async (wallet: WalletRow) => {
    const draft = limitDraft[wallet.id] ?? wallet.creditLimit
    const limit = Number.isFinite(draft) && draft > 0 ? draft : 0
    if (limit <= 0) {
      setError('Defina um limite maior que zero para habilitar fiado')
      return
    }
    await persistModel(wallet, 'postpaid', limit)
  }

  const handleDisablePostpaid = async (wallet: WalletRow) => {
    await persistModel(wallet, 'prepaid', 0)
  }

  if (role !== 'admin') {
    return (
      <div className="card">
        <div className="card-title">Acesso restrito</div>
        <p className="muted">Somente administradores podem ajustar fiado.</p>
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Carteiras e limite de fiado</h3>
          <span className="muted">Habilite ou desabilite fiado por aluno</span>
        </div>
        {error && <div className="pill danger">{error}</div>}
        {loading && <div className="muted">Carregando carteiras...</div>}
        {!loading && (
          <table className="table">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Modelo</th>
                <th>Saldo/Limite</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => {
                const available =
                  wallet.model === 'prepaid'
                    ? wallet.balance
                    : Math.max(wallet.creditLimit - wallet.balance, 0)
                return (
                  <tr key={wallet.id}>
                    <td>
                      <strong>{wallet.studentName ?? 'Aluno'}</strong>
                      <div className="muted">
                        {wallet.grade} {wallet.period ? `· ${wallet.period}` : ''}
                      </div>
                    </td>
                    <td>{wallet.model === 'prepaid' ? 'Pre-pago' : 'Fiado'}</td>
                    <td>
                      {wallet.model === 'prepaid'
                        ? formatCurrency(wallet.balance)
                        : `${formatCurrency(wallet.balance)} usado de ${formatCurrency(wallet.creditLimit)} (${formatCurrency(available)} disponivel)`}
                    </td>
                    <td>
                      {wallet.model === 'prepaid' ? (
                        <div className="chips">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            step={10}
                            style={{ width: 120 }}
                            value={limitDraft[wallet.id] ?? wallet.creditLimit ?? 0}
                            onChange={(e) =>
                              setLimitDraft((prev) => ({ ...prev, [wallet.id]: Number(e.target.value) }))
                            }
                          />
                          <button className="btn" onClick={() => void handleEnablePostpaid(wallet)}>
                            Habilitar fiado
                          </button>
                        </div>
                      ) : (
                        <div className="chips">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            step={10}
                            style={{ width: 120 }}
                            value={limitDraft[wallet.id] ?? wallet.creditLimit ?? 0}
                            onChange={(e) =>
                              setLimitDraft((prev) => ({ ...prev, [wallet.id]: Number(e.target.value) }))
                            }
                          />
                          <button className="btn" onClick={() => void handleEnablePostpaid(wallet)}>
                            Atualizar limite
                          </button>
                          <button className="btn btn-ghost" onClick={() => void handleDisablePostpaid(wallet)}>
                            Desabilitar fiado
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {wallets.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Nenhuma carteira encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default AdminWalletsPage
