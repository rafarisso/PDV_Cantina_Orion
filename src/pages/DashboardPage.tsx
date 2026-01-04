import { useMemo } from 'react'
import { useData } from '@/state/DataContext'
import { formatCurrency, formatDateTime, maskCpf } from '@/lib/format'

const DashboardPage = () => {
  const { students, wallets, alerts, orders, guardians } = useData()

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

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="grid stats">
        <div className="stat">
          <small>Saldo total (pre-pago)</small>
          <strong>{formatCurrency(stats.prepaidBalance)}</strong>
        </div>
        <div className="stat">
          <small>Debitos em fiado</small>
          <strong>{formatCurrency(stats.debitTotal)}</strong>
        </div>
        <div className="stat">
          <small>Alunos bloqueados</small>
          <strong>{stats.blocked}</strong>
        </div>
        <div className="stat">
          <small>Alertas pendentes</small>
          <strong>{stats.alertsOpen}</strong>
        </div>
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
