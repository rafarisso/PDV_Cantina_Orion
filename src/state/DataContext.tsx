import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { env } from '@/lib/env'
import {
  type Alert,
  type CartItem,
  type Guardian,
  type LedgerEntry,
  type Order,
  type PixCharge,
  type Product,
  type Student,
  type UserRole,
  type Wallet,
} from '@/types/domain'
import { demoAlerts, demoGuardians, demoLedger, demoOrders, demoProducts, demoStudents, demoWallets } from '@/data/demoData'

interface DataContextValue {
  guardians: Guardian[]
  students: Student[]
  wallets: Wallet[]
  products: Product[]
  orders: Order[]
  alerts: Alert[]
  ledger: LedgerEntry[]
  pixCharges: PixCharge[]
  registerGuardian: (data: Guardian) => void
  registerStudent: (data: Student, options: { creditLimit?: number; alertBaseline?: number }) => void
  recordPurchase: (params: {
    studentId: string
    items: CartItem[]
    actorId: string
    actorRole: UserRole
  }) => Promise<{
    order: Order
    wallet: Wallet
    triggeredAlerts: Alert[]
  }>
  adjustWallet: (params: {
    studentId: string
    amount: number
    description: string
    actorId: string
    actorRole: UserRole
  }) => Wallet
  acknowledgeAlert: (alertId: string) => void
  createPixCharge: (params: { guardianId: string; studentId?: string; amount: number; description?: string }) => PixCharge
}

const ALERT_LEVELS = [0.3, 0.15, 0]

const DataContext = createContext<DataContextValue | undefined>(undefined)

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const uid = () => crypto.randomUUID()

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [guardians, setGuardians] = useState<Guardian[]>(demoGuardians)
  const [students, setStudents] = useState<Student[]>(demoStudents)
  const [wallets, setWallets] = useState<Wallet[]>(demoWallets)
  const [products] = useState<Product[]>(demoProducts)
  const [orders, setOrders] = useState<Order[]>(demoOrders)
  const [alerts, setAlerts] = useState<Alert[]>(demoAlerts)
  const [ledger, setLedger] = useState<LedgerEntry[]>(demoLedger)
  const [pixCharges, setPixCharges] = useState<PixCharge[]>([])

  const findWallet = (studentId: string) => wallets.find((w) => w.studentId === studentId)

  const pushAlert = (alert: Alert) => setAlerts((prev) => [alert, ...prev])

  const computeThresholdAlerts = (wallet: Wallet, guardianId: string, studentId: string, available: number) => {
    const base = wallet.alertBaseline ?? wallet.creditLimit ?? 0
    const ratio = base === 0 ? 0 : available / base
    const triggered: Alert[] = []

    if (base > 0) {
      ALERT_LEVELS.filter((level) => level > 0).forEach((level) => {
        const alreadyTriggered = wallet.lastAlertLevel !== undefined && wallet.lastAlertLevel <= level
        if (!alreadyTriggered && ratio <= level) {
          const alert: Alert = {
            id: uid(),
            studentId,
            guardianId,
            type: wallet.model === 'prepaid' ? 'balance' : 'limit',
            level,
            message:
              wallet.model === 'prepaid'
                ? `Saldo atingiu ${Math.round(level * 100)}%`
                : `Limite restante atingiu ${Math.round(level * 100)}%`,
            createdAt: new Date().toISOString(),
          }
          triggered.push(alert)
          wallet.lastAlertLevel = level
        }
      })
    }
    if (available <= 0 && (wallet.lastAlertLevel === undefined || wallet.lastAlertLevel > 0)) {
      const alert: Alert = {
        id: uid(),
        studentId,
        guardianId,
        type: wallet.model === 'prepaid' ? 'balance' : 'limit',
        level: 0,
        message: 'Aviso automatico: saldo/limite zerado',
        createdAt: new Date().toISOString(),
      }
      triggered.push(alert)
      wallet.lastAlertLevel = 0
    }

    return triggered
  }

  const recordPurchase = async ({
    studentId,
    items,
    actorId,
    actorRole,
  }: {
    studentId: string
    items: CartItem[]
    actorId: string
    actorRole: UserRole
  }) => {
    const student = students.find((s) => s.id === studentId)
    if (!student) throw new Error('Aluno nao encontrado')
    if (student.status !== 'active') throw new Error('Aluno nao esta ativo')
    if (!(actorRole === 'admin' || actorRole === 'operator')) throw new Error('Sem permissao para registrar compra')

    const wallet = findWallet(studentId)
    if (!wallet) throw new Error('Carteira nao encontrada')
    if (wallet.blocked) throw new Error('Aluno bloqueado para compras')

    // Fluxo real via RPC
    if (supabase && !env.isDemo) {
      const payload = items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
      }))
      const { data: orderId, error } = await supabase.rpc('process_purchase', {
        p_student_id: studentId,
        p_items: payload,
      })
      if (error) {
        const err = new Error(error.message) as Error & { code?: string }
        if ('code' in error) {
          err.code = (error as any).code
        }
        throw err
      }
      const { data: walletRow, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle()
      if (walletError || !walletRow) {
        throw new Error(walletError?.message ?? 'Carteira nao encontrada apos compra')
      }
      const updatedWallet: Wallet = {
        id: walletRow.id,
        studentId: walletRow.student_id,
        balance: Number(walletRow.balance),
        creditLimit: Number(walletRow.credit_limit),
        model: walletRow.model,
        allowNegativeOnceUsed: walletRow.allow_negative_once_used,
        blocked: walletRow.blocked,
        blockedReason: walletRow.blocked_reason ?? undefined,
        alertBaseline: walletRow.alert_baseline ?? undefined,
        lastAlertLevel: walletRow.last_alert_level ?? undefined,
      }
      const createdOrderId = (orderId as string) ?? uid()
      const order: Order = {
        id: createdOrderId,
        studentId,
        items: items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.product.price,
        })),
        total: items.reduce((sum, item) => sum + item.quantity * item.product.price, 0),
        createdAt: new Date().toISOString(),
        createdBy: actorId,
      }
      setWallets((prev) => prev.map((w) => (w.studentId === studentId ? updatedWallet : w)))
      setOrders((prev) => [order, ...prev])
      if (!env.isDemo) {
        void fetch('/api/notify-purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: createdOrderId }),
        }).catch((err: unknown) => console.warn('Falha ao notificar compra via WhatsApp', err))
      }
      if (env.isDemo) {
        console.log('[DEMO] notificar compra', createdOrderId)
      }
      return { order, wallet: updatedWallet, triggeredAlerts: [] }
    }

    const total = items.reduce((sum, item) => sum + item.quantity * item.product.price, 0)
    const now = new Date().toISOString()
    const guardianId = student.guardianId
    const nextWallet: Wallet = { ...wallet }
    const triggeredAlerts: Alert[] = []

    if (wallet.model === 'prepaid') {
      if (wallet.balance >= total) {
        nextWallet.balance = Number((wallet.balance - total).toFixed(2))
      } else if (!wallet.allowNegativeOnceUsed) {
        // allow one exception and block after
        nextWallet.balance = Number((wallet.balance - total).toFixed(2))
        nextWallet.allowNegativeOnceUsed = true
        nextWallet.blocked = true
        nextWallet.blockedReason = 'Saldo negativo. Necessario credito.'
        const alert: Alert = {
          id: uid(),
          studentId,
          guardianId,
          type: 'negative',
          level: -1,
          message: `Compra liberada com saldo negativo (${total.toFixed(2)}). Aluno bloqueado ate creditos.`,
          createdAt: now,
        }
        triggeredAlerts.push(alert)
      } else {
        throw new Error('Saldo insuficiente. Aluno ja usou a excecao de saldo negativo.')
      }
    } else {
      const newDebt = wallet.balance + total
      if (newDebt > wallet.creditLimit) {
        const blockedWallet: Wallet = {
          ...wallet,
          blocked: true,
          blockedReason: 'Limite de fiado excedido',
        }
        setWallets((prev) => prev.map((w) => (w.id === wallet.id ? blockedWallet : w)))
        throw new Error('Limite de fiado excedido. Bloqueado.')
      }
      nextWallet.balance = Number(newDebt.toFixed(2))
    }

    const available =
      wallet.model === 'prepaid' ? nextWallet.balance : Math.max(nextWallet.creditLimit - nextWallet.balance, 0)
    const thresholdAlerts = computeThresholdAlerts(nextWallet, guardianId, studentId, available)
    triggeredAlerts.push(...thresholdAlerts)

    const order: Order = {
      id: uid(),
      studentId,
      items: items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.product.price,
      })),
      total: Number(total.toFixed(2)),
      createdAt: now,
      createdBy: actorId,
    }

    const ledgerEntry: LedgerEntry = {
      id: uid(),
      walletId: wallet.id,
      kind: 'purchase',
      amount: wallet.model === 'prepaid' ? -total : total,
      balanceAfter: nextWallet.balance,
      createdAt: now,
      description: 'Compra registrada no PDV',
      relatedOrderId: order.id,
      createdBy: actorId,
    }

    setOrders((prev) => [order, ...prev])
    setLedger((prev) => [ledgerEntry, ...prev])
    setWallets((prev) => prev.map((w) => (w.id === wallet.id ? nextWallet : w)))
    triggeredAlerts.forEach(pushAlert)

    return { order, wallet: nextWallet, triggeredAlerts }
  }

  const registerGuardian = (data: Guardian) => {
    if (!data.fullName || !data.phone || !data.cpf) {
      throw new Error('Dados do responsavel sao obrigatorios')
    }
    setGuardians((prev) => [...prev, clone(data)])
  }

  const registerStudent = (data: Student, options: { creditLimit?: number; alertBaseline?: number }) => {
    if (!data.fullName || !data.guardianId || !data.grade || !data.period) {
      throw new Error('Dados do aluno incompletos')
    }
    setStudents((prev) => [...prev, clone(data)])
    const wallet: Wallet = {
      id: uid(),
      studentId: data.id,
      balance: data.pricingModel === 'prepaid' ? 0 : 0,
      creditLimit: options.creditLimit ?? 0,
      model: data.pricingModel,
      allowNegativeOnceUsed: false,
      blocked: false,
      alertBaseline: options.alertBaseline ?? (data.pricingModel === 'prepaid' ? options.creditLimit ?? 50 : options.creditLimit),
    }
    setWallets((prev) => [...prev, wallet])
  }

  const adjustWallet = ({
    studentId,
    amount,
    description,
    actorId,
    actorRole,
  }: {
    studentId: string
    amount: number
    description: string
    actorId: string
    actorRole: UserRole
  }) => {
    if (actorRole !== 'admin') throw new Error('Ajuste permitido apenas para administradores')
    const wallet = findWallet(studentId)
    if (!wallet) throw new Error('Carteira nao encontrada')
    const updated: Wallet = { ...wallet, balance: Number((wallet.balance + amount).toFixed(2)) }
    if (updated.balance >= 0) {
      updated.blocked = false
      updated.blockedReason = undefined
    }
    const entry: LedgerEntry = {
      id: uid(),
      walletId: wallet.id,
      kind: amount >= 0 ? 'credit' : 'debit',
      amount,
      balanceAfter: updated.balance,
      createdAt: new Date().toISOString(),
      description,
      createdBy: actorId,
    }
    setWallets((prev) => prev.map((w) => (w.id === wallet.id ? updated : w)))
    setLedger((prev) => [entry, ...prev])
    return updated
  }

  const acknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === alertId ? { ...alert, acknowledgedAt: new Date().toISOString() } : alert)),
    )
  }

  const createPixCharge = ({
    guardianId,
    studentId,
    amount,
    description,
  }: {
    guardianId: string
    studentId?: string
    amount: number
    description?: string
  }) => {
    const charge: PixCharge = {
      id: uid(),
      guardianId,
      studentId,
      txid: uid(),
      status: 'created',
      amount,
      brCode: '',
      createdAt: new Date().toISOString(),
      description,
    }
    setPixCharges((prev) => [charge, ...prev])
    return charge
  }

  const value = useMemo<DataContextValue>(
    () => ({
      guardians,
      students,
      wallets,
      products,
      orders,
      alerts,
      ledger,
      pixCharges,
      registerGuardian,
      registerStudent,
      recordPurchase,
      adjustWallet,
      acknowledgeAlert,
      createPixCharge,
    }),
    [alerts, guardians, ledger, orders, pixCharges, products, students, wallets],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
