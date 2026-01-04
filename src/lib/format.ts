import { format } from 'date-fns'

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const formatDateTime = (iso: string) => format(new Date(iso), 'dd/MM/yyyy HH:mm')

export const formatDateOnly = (iso: string) => format(new Date(iso), 'dd/MM/yyyy')

export const maskCpf = (cpf: string, reveal?: boolean) => {
  const digits = cpf.replace(/\D/g, '')
  if (reveal) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length < 11) return 'CPF incompleto'
  return `***.${digits.slice(3, 6)}.***-${digits.slice(-2)}`
}

export const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return digits.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4')
}

export const percentage = (value: number, total: number) => {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}
