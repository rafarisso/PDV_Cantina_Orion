export type UserRole = 'admin' | 'operator' | 'guardian'

export type StudyPeriod = 'morning' | 'afternoon'
export type StudentStatus = 'active' | 'inactive' | 'blocked'
export type PricingModel = 'prepaid' | 'postpaid'

export type AlertType = 'balance' | 'limit' | 'negative' | 'block'
export type LedgerKind = 'purchase' | 'credit' | 'debit' | 'adjustment' | 'payment'
export type PixChargeStatus = 'created' | 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'

export interface Address {
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  zipCode: string
}

export interface Guardian {
  id: string
  fullName: string
  phone: string
  cpf: string
  address: Address
  termsAcceptedAt?: string
  termsVersion?: string
}

export interface Student {
  id: string
  guardianId: string
  fullName: string
  grade: string
  period: StudyPeriod
  status: StudentStatus
  pricingModel: PricingModel
  observations?: string
}

export interface Wallet {
  id: string
  studentId: string
  balance: number
  creditLimit: number
  model: PricingModel
  allowNegativeOnceUsed: boolean
  blocked: boolean
  blockedReason?: string
  alertBaseline?: number
  lastAlertLevel?: number
}

export interface Product {
  id: string
  name: string
  price: number
  category?: string
  active?: boolean
}

export interface OrderItem {
  productId: string
  quantity: number
  unitPrice: number
}

export interface Order {
  id: string
  studentId: string
  total: number
  items: OrderItem[]
  createdAt: string
  createdBy: string
  note?: string
}

export interface LedgerEntry {
  id: string
  walletId: string
  kind: LedgerKind
  amount: number
  balanceAfter: number
  createdAt: string
  description?: string
  relatedOrderId?: string
  createdBy: string
}

export interface PixCharge {
  id: string
  ledgerId?: string
  guardianId: string
  studentId?: string
  txid: string
  status: PixChargeStatus
  amount: number
  brCode?: string
  expiresAt?: string
  createdAt: string
  description?: string
}

export interface Alert {
  id: string
  studentId: string
  guardianId: string
  type: AlertType
  level: number
  message: string
  createdAt: string
  acknowledgedAt?: string
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface SessionUser {
  id: string
  email?: string
  role: UserRole
  fullName?: string
}
