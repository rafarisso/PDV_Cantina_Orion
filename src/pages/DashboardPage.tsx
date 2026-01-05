import { useEffect, useMemo, useState } from 'react'
import { useData } from '@/state/DataContext'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import { formatCurrency, formatDateTime, maskCpf } from '@/lib/format'

type SalesWindow = { total?: number; window_start?: string; window_end?: string }
type BestClient = { full_name?: string; student_id?: string; total_spent?: number; grade?: string; period?: string }
type WeeklyRow = {
  student_id?: string
  guardian_id?: string
  full_name?: string
  period?: string
  total_spent?: number
  first_purchase?: string
  last_purchase?: string
}

const DashboardPage = () => {
  const { students, wallets, alerts, orders, guardians } = useData()
  const [loadingViews, setLoadingViews] = useState(!env.isDemo && Boolean(supabase))
  const [viewError, setViewError] = useState<string | null>(null)
  const [salesToday, setSalesToday] = useState<number | null>(null)
  const [bestWindow, setBestWindow] = useState<SalesWindow | null>(null)
  const [bestClient, setBestClient] = useState<BestClient | null>(null)
  const [weeklyConsumption, setWeeklyConsumption] = useState<WeeklyRow[]>([])

  useEffect(() => {
    const client = supabase
    if (env.configError || (!client && !env.isDemo)) {
      setViewError('Supabase nao configurado')
      setLoadingViews(false)
      return
    }
    if (!client || env.isDemo) {
      setLoadingViews(false)
      return
    }
    setLoadingViews(true)
    setViewError(null)
    const fetchViews = async () => {
      const [salesRes, windowRes, bestRes, weeklyRes] = await Promise.all([
        client.from('admin_sales_today').select('*').maybeSingle(),
        client
          .from('admin_sales_today_20min')
          .select('*')
          .order('total', { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from('admin_best_client_today')
          .select('*')
          .order('total_spent', { ascending: false })
          .limit(1)
          .maybeSingle(),
        client.from('weekly_consumption').select('*'),
      ])
      if (salesRes.error || windowRes.error || bestRes.error || weeklyRes.error) {
        setViewError(
          salesRes.error?.message ??
            windowRes.error?.message ??
            bestRes.error?.message ??
            weeklyRes.error?.message ??
            'Falha ao carregar visoes',
        )
      }
      setSalesToday(
        salesRes.data ? Number((salesRes.data as any).total ?? (salesRes.data as any).sum_total ?? 0) : null,
      )
      setBestWindow(windowRes.data ? (windowRes.data as SalesWindow) : null)
      setBestClient(bestRes.data ? (bestRes.data as BestClient) : null)
      setWeeklyConsumption(Array.isArray(weeklyRes.data) ? (weeklyRes.data as WeeklyRow[]) : [])
      setLoadingViews(false)
    }
    void fetchViews()
  }, [])

  const fallbackSalesToday = useMemo(
    () => orders.reduce((sum, order) => sum + order.total, 0),
    [orders],
  )

  const fallbackBestClient = useMemo(() => {
    const totals = new Map<string, number>()
    orders.forEach((order) => {
      totals.set(order.studentId, (totals.get(order.studentId) ?? 0) + order.total)
    })
    const [studentId, total] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0]
    const student = students.find((s) => s.id === studentId)
    return studentId
      ? ({ student_id: studentId, full_name: student?.fullName, total_spent: total, grade: student?.grade, period: student?.period } as BestClient)
      : null
  }, [orders, students])

  const fallbackWeekly = useMemo<WeeklyRow[]>(() => {
    const map = new Map<string, { total: number; first: string; last: string; student?: any }>()
    orders.forEach((order) => {
      const student = students.find((s) => s.id === order.studentId)
      const current = map.get(order.studentId) ?? {
        total: 0,
        first: order.createdAt,
        last: order.createdAt,
        student,
      }
      current.total += order.total
      current.first = current.first < order.createdAt ? current.first : order.createdAt
      current.last = current.last > order.createdAt ? current.last : order.createdAt
      map.set(order.studentId, current)
    })
    return [...map.entries()].map(([studentId, info]) => ({
      student_id: studentId,
      full_name: info.student?.fullName,
      period: info.student?.period,
      total_spent: info.total,
      first_purchase: info.first,
      last_purchase: info.last,
    }))
  }, [orders, students])

  const stats = useMemo(() => {
    const prepaidBalance = wallets
      .filter((w) => w.model === 'prepaid')
      .reduce((sum, w) => sum + w.balance, 0)
    const debitTotal = wallets
      .filter((w) => w.model === 'postpaid')
      .reduce((sum, w) => sum + w.balance, 0)
    const blocked = wallets.filter((w) => w.blocked).length
    return {
      prepaidBalance,
      debitTotal,
      blocked,
      alertsOpen: alerts.filter((a) => !a.acknowledgedAt).length,
    }
  }, [alerts, wallets])

  const blockedStudents = wallets.filter((w) => w.blocked)
  const latestAlerts = alerts.slice(0, 4)
  const latestOrders = orders.slice(0, 5)

  const findStudent = (studentId: string) => students.find((s) => s.id === studentId)
  const findGuardian = (guardianId: string) => guardians.find((g) => g.id === guardianId)

  const effectiveSalesToday = env.isDemo ? fallbackSalesToday : salesToday
  const effectiveBestClient = env.isDemo ? fallbackBestClient ?? undefined : bestClient ?? undefined
  const effectiveWeekly = env.isDemo ? fallbackWeekly : weeklyConsumption

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="grid stats">
        <div className="stat">
          <small>Total vendido hoje</small>
          <strong>{formatCurrency(effectiveSalesToday)}</strong>
          {viewError && <div className="muted">Usando dados locais</div>}
        </div>
        <div className="stat">
          <small>Melhor janela 20 min</small>
          <strong>{bestWindow?.total ? formatCurrency(bestWindow.total) : 'Sem dados'}</strong>
          {bestWindow?.window_start && bestWindow?.window_end && (
            <div className="muted">
              {formatDateTime(bestWindow.window_start)} - {formatDateTime(bestWindow.window_end)}
            </div>
          )}
        </div>
        <div className="stat">
          <small>Melhor cliente hoje</small>
          <strong>{effectiveBestClient?.full_name ?? 'Sem vendas'}</strong>
          {effectiveBestClient?.total_spent !== undefined && (
            <div className="muted">{formatCurrency(effectiveBestClient.total_spent ?? 0)}</div>
          )}
        </div>
        <div className="stat">
          <small>Alertas pendentes</small>
          <strong>{stats.alertsOpen}</strong>
        </div>
      </section>

      {loadingViews && <div className="muted">Carregando visoes do admin...</div>}
      {viewError && <div className="pill danger">{viewError}</div>}

      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Consumo semanal</h3>
          <span className="muted">Fonte: weekly_consumption</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Periodo</th>
              <th>Total gasto</th>
              <th>Primeira/ultima compra</th>
            </tr>
          </thead>
          <tbody>
            {effectiveWeekly.map((row) => (
              <tr key={row.student_id ?? row.full_name}>
                <td>{row.full_name ?? findStudent(row.student_id ?? '')?.fullName ?? 'Aluno'}</td>
                <td>{row.period ?? findStudent(row.student_id ?? '')?.period ?? '-'}</td>
                <td>{formatCurrency(Number(row.total_spent ?? 0))}</td>
                <td>
                  {row.first_purchase ? formatDateTime(row.first_purchase) : '-'}{' '}
                  {row.last_purchase ? ` / ${formatDateTime(row.last_purchase)}` : ''}
                </td>
              </tr>
            ))}
            {effectiveWeekly.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Sem dados ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Alertas recentes</h3>
          <span className="muted">Envio automatico de avisos 30/15/0%</span>
        </div>
        <div className="list">
          {latestAlerts.map((alert) => {
            const student = findStudent(alert.studentId)
            const guardian = findGuardian(alert.guardianId)
            return (
              <div key={alert.id} className="card alert-card">
                <strong>{student?.fullName ?? 'Aluno'}</strong>
                <div className="muted">
                  Responsavel: {guardian?.fullName ?? 'Nao informado'} ({maskCpf(guardian?.cpf ?? '', false)})
                </div>
                <div>{alert.message}</div>
                <small className="muted">{formatDateTime(alert.createdAt)}</small>
              </div>
            )
          })}
          {latestAlerts.length === 0 && <div className="muted">Sem alertas abertos.</div>}
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Alunos bloqueados</h3>
          <span className="muted">Saldo negativo ou limite excedido</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Modelo</th>
              <th>Saldo/Limite</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {blockedStudents.map((wallet) => {
              const student = findStudent(wallet.studentId)
              return (
                <tr key={wallet.id}>
                  <td>{student?.fullName}</td>
                  <td>{wallet.model === 'prepaid' ? 'Pre-pago' : 'Fiado'}</td>
                  <td>
                    {wallet.model === 'prepaid'
                      ? formatCurrency(wallet.balance)
                      : `${formatCurrency(wallet.balance)} / ${formatCurrency(wallet.creditLimit)}`}
                  </td>
                  <td>{wallet.blockedReason ?? 'Regra de bloqueio automatica'}</td>
                </tr>
              )
            })}
            {blockedStudents.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nenhum aluno bloqueado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Compras recentes</h3>
          <span className="muted">Registro com auditoria</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Total</th>
              <th>Itens</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {latestOrders.map((order) => {
              const student = findStudent(order.studentId)
              return (
                <tr key={order.id}>
                  <td>{student?.fullName}</td>
                  <td>{formatCurrency(order.total)}</td>
                  <td>
                    {order.items.map((item) => `${item.quantity}x ${item.productId}`).join(', ')}
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                </tr>
              )
            })}
            {latestOrders.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nenhuma compra registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default DashboardPage
