import { useMemo, useState } from 'react'
import { useAuth } from '@/state/AuthContext'
import { useData } from '@/state/DataContext'
import { type CartItem, type Product } from '@/types/domain'
import { formatCurrency, maskCpf } from '@/lib/format'

const POSPage = () => {
  const { products, students, wallets, guardians, recordPurchase } = useData()
  const { role, user } = useAuth()
  const [query, setQuery] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filteredStudents = useMemo(() => {
    const q = query.toLowerCase()
    return students.filter(
      (student) =>
        student.fullName.toLowerCase().includes(q) ||
        student.grade.toLowerCase().includes(q) ||
        student.period.toLowerCase().includes(q),
    )
  }, [query, students])

  const selectedStudent = selectedStudentId
    ? students.find((student) => student.id === selectedStudentId)
    : undefined
  const selectedWallet = selectedStudent ? wallets.find((w) => w.studentId === selectedStudent.id) : undefined
  const guardian = selectedStudent ? guardians.find((g) => g.id === selectedStudent.guardianId) : undefined

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const increment = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  const handlePurchase = async () => {
    if (!selectedStudent || !user) return
    try {
      const { wallet, triggeredAlerts } = await recordPurchase({
        studentId: selectedStudent.id,
        items: cart,
        actorId: user.id,
        actorRole: role,
      })
      setFeedback(
        `Compra confirmada. Notificação enviada ao responsável. Novo saldo/limite: ${
          wallet.model === 'prepaid' ? formatCurrency(wallet.balance) : formatCurrency(wallet.creditLimit - wallet.balance)
        }`,
      )
      if (triggeredAlerts.length > 0) {
        setFeedback(
          `${triggeredAlerts[0].message} Comunicacao pronta para WhatsApp/Push. Novo estado: ${
            wallet.blocked ? 'bloqueado' : 'liberado'
          }.`,
        )
      }
      setCart([])
      setError(null)
    } catch (err) {
      const code = (err as any)?.code as string | undefined
      if (code) {
        setError((err as Error).message)
      } else {
        setError((err as Error).message)
      }
    }
  }

  const statusBadge = () => {
    if (!selectedWallet) return null
    const available =
      selectedWallet.model === 'prepaid'
        ? selectedWallet.balance
        : Math.max(selectedWallet.creditLimit - selectedWallet.balance, 0)
    if (selectedWallet.blocked) {
      return <span className="pill danger">Bloqueado: {selectedWallet.blockedReason ?? 'regra financeira'}</span>
    }
    if (available <= (selectedWallet.alertBaseline ?? selectedWallet.creditLimit ?? 30) * 0.15) {
      return <span className="pill warning">Proximo de limite</span>
    }
    return <span className="pill positive">Liberado</span>
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>PDV Balcao</h3>
          <span className="muted">Busca rapida por aluno, serie ou periodo</span>
        </div>
        <input
          className="input"
          placeholder="Buscar aluno (nome, serie, periodo)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
          {filteredStudents.map((student) => {
            const wallet = wallets.find((w) => w.studentId === student.id)
            const available =
              wallet?.model === 'prepaid'
                ? wallet.balance
                : wallet
                  ? Math.max(wallet.creditLimit - wallet.balance, 0)
                  : 0
            return (
              <button
                key={student.id}
                className={`card ${selectedStudentId === student.id ? 'active' : ''}`}
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => setSelectedStudentId(student.id)}
              >
                <strong>{student.fullName}</strong>
                <div className="muted">
                  {student.grade} · {student.period === 'morning' ? 'manha' : 'tarde'}
                </div>
                <div className="chips" style={{ marginTop: 8 }}>
                  <span className="pill">{student.pricingModel === 'prepaid' ? 'Pre-pago' : 'Fiado'}</span>
                  <span className="pill">
                    {student.pricingModel === 'prepaid'
                      ? `Saldo ${formatCurrency(wallet?.balance ?? 0)}`
                      : `Disponivel ${formatCurrency(available)}`}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {selectedStudent && selectedWallet && (
        <div className="grid grid-cols-2">
          <section className="card">
            <div className="section-title">
              <h3 style={{ margin: 0 }}>Dados do aluno</h3>
              {statusBadge()}
            </div>
            <p>
              <strong>{selectedStudent.fullName}</strong> — {selectedStudent.grade} (
              {selectedStudent.period === 'morning' ? 'manha' : 'tarde'})
            </p>
            <p className="muted">
              Responsavel: {guardian?.fullName ?? 'Nao informado'}
              {role === 'admin' && guardian ? ` · CPF: ${maskCpf(guardian.cpf, true)}` : ''}
            </p>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="pill">Modelo: {selectedWallet.model === 'prepaid' ? 'Pre-pago' : 'Fiado com limite'}</span>
              <span className="pill">
                {selectedWallet.model === 'prepaid'
                  ? `Saldo: ${formatCurrency(selectedWallet.balance)}`
                  : `Disponivel: ${formatCurrency(selectedWallet.creditLimit - selectedWallet.balance)}`}
              </span>
              {selectedWallet.blocked && <span className="pill danger">Bloqueado</span>}
            </div>
          </section>

          <section className="card">
            <div className="section-title">
              <h3 style={{ margin: 0 }}>Produtos</h3>
              <span className="muted">Toque para adicionar</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {products
                .filter((p) => p.active !== false)
                .map((product) => (
                  <button
                    key={product.id}
                    className="card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => addToCart(product)}
                  >
                    <strong>{product.name}</strong>
                    <div className="muted">{product.category}</div>
                    <div style={{ marginTop: 8 }}>{formatCurrency(product.price)}</div>
                  </button>
                ))}
            </div>
          </section>

          <section className="card">
            <div className="section-title">
              <h3 style={{ margin: 0 }}>Carrinho</h3>
              <span className="muted">Confirme antes de finalizar</span>
            </div>
            <div className="list">
              {cart.map((item) => (
                <div key={item.product.id} className="card" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{item.product.name}</strong>
                      <div className="muted">{formatCurrency(item.product.price)}</div>
                    </div>
                    <div className="chips">
                      <button className="btn" onClick={() => increment(item.product.id, -1)}>
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button className="btn" onClick={() => increment(item.product.id, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <div className="muted">Nenhum item.</div>}
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Total</strong>
              <strong>{formatCurrency(cartTotal)}</strong>
            </div>
            {feedback && <div className="pill positive">{feedback}</div>}
            {error && <div className="pill danger">{error}</div>}
            <button
              className="btn btn-primary"
              disabled={!cart.length || !selectedStudent || selectedWallet.blocked}
              onClick={handlePurchase}
            >
              Finalizar compra
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

export default POSPage
