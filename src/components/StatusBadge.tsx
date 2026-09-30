import { useI18n } from '../i18n/context'
import type { OrderStatus, PaymentStatus, ShipmentStatus } from '../types'

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const { t } = useI18n()
  return <span className={`badge badge-${status}`}>{t.status[status]}</span>
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n()
  return <span className={`badge badge-pay-${status}`}>{t.paymentStatus[status]}</span>
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n()
  return <span className={`badge badge-order-${status}`}>{t.orderStatus[status]}</span>
}
