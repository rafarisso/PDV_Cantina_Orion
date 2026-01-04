import { type Alert, type Guardian, type LedgerEntry, type Order, type Product, type Student, type Wallet } from '@/types/domain'

const now = new Date().toISOString()

export const demoGuardians: Guardian[] = [
  {
    id: 'gua-ana',
    fullName: 'Ana Souza',
    phone: '+55 11 98888-1212',
    cpf: '12345678901',
    address: {
      street: 'Rua das Palmeiras',
      number: '100',
      neighborhood: 'Centro',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01000-000',
    },
    termsAcceptedAt: now,
    termsVersion: '2025-01',
  },
  {
    id: 'gua-carlos',
    fullName: 'Carlos Lima',
    phone: '+55 11 97777-3434',
    cpf: '98765432100',
    address: {
      street: 'Av. Orion',
      number: '200',
      neighborhood: 'Jardim Escola',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '04000-000',
    },
    termsAcceptedAt: now,
    termsVersion: '2025-01',
  },
]

export const demoStudents: Student[] = [
  {
    id: 'stu-lucas',
    guardianId: 'gua-ana',
    fullName: 'Lucas Souza',
    grade: '7o ano',
    period: 'morning',
    status: 'active',
    pricingModel: 'prepaid',
  },
  {
    id: 'stu-marina',
    guardianId: 'gua-carlos',
    fullName: 'Marina Lima',
    grade: '9o ano',
    period: 'afternoon',
    status: 'active',
    pricingModel: 'postpaid',
  },
]

export const demoWallets: Wallet[] = [
  {
    id: 'wal-lucas',
    studentId: 'stu-lucas',
    balance: 45,
    creditLimit: 50,
    model: 'prepaid',
    allowNegativeOnceUsed: false,
    blocked: false,
    alertBaseline: 50,
  },
  {
    id: 'wal-marina',
    studentId: 'stu-marina',
    balance: 20, // using balance as current debit for postpaid
    creditLimit: 80,
    model: 'postpaid',
    allowNegativeOnceUsed: true,
    blocked: false,
    alertBaseline: 80,
  },
]

export const demoProducts: Product[] = [
  { id: 'prod-suco', name: 'Suco Natural', price: 6.5, category: 'Bebidas', active: true },
  { id: 'prod-sanduiche', name: 'Sanduiche Integral', price: 9.9, category: 'Lanches', active: true },
  { id: 'prod-salgado', name: 'Pao de Queijo', price: 4.5, category: 'Lanches', active: true },
  { id: 'prod-brownie', name: 'Brownie', price: 7.5, category: 'Doces', active: true },
]

export const demoOrders: Order[] = [
  {
    id: 'ord-001',
    studentId: 'stu-lucas',
    total: 12,
    createdAt: now,
    createdBy: 'admin-demo',
    items: [
      { productId: 'prod-suco', quantity: 1, unitPrice: 6.5 },
      { productId: 'prod-salgado', quantity: 1, unitPrice: 5.5 },
    ],
  },
]

export const demoLedger: LedgerEntry[] = [
  {
    id: 'led-001',
    walletId: 'wal-lucas',
    kind: 'purchase',
    amount: -12,
    balanceAfter: 45 - 12,
    createdAt: now,
    description: 'Compra no balcao',
    relatedOrderId: 'ord-001',
    createdBy: 'admin-demo',
  },
]

export const demoAlerts: Alert[] = [
  {
    id: 'al-001',
    studentId: 'stu-lucas',
    guardianId: 'gua-ana',
    type: 'balance',
    level: 0.3,
    message: 'Saldo abaixo de 30%.',
    createdAt: now,
  },
]
