import type { ReactNode } from 'react'
import { useI18n } from '../i18n/context'
import type { Payment } from '../types'
import { formatDateTime, formatMoney } from '../utils/format'
import { PaymentBadge } from './StatusBadge'

interface Props<P extends Payment> {
  payments: P[]
  /** Optional extra first column (e.g. a link to the shipment in the admin list). */
  shipmentCell?: (payment: P) => ReactNode
}

export function PaymentsTable<P extends Payment>({ payments, shipmentCell }: Props<P>) {
  const { t, lang } = useI18n()

  if (payments.length === 0) return <p className="empty">{t.admin.noPayments}</p>

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {shipmentCell && <th>{t.payment.shipment}</th>}
            <th>{t.payment.date}</th>
            <th>{t.payment.amount}</th>
            <th>{t.payment.status}</th>
            <th>{t.payment.provider}</th>
            <th>{t.payment.reference}</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              {shipmentCell && <td>{shipmentCell(payment)}</td>}
              <td className="nowrap">{formatDateTime(payment.created_at, lang)}</td>
              <td className="nowrap">{formatMoney(payment.amount, payment.currency, lang)}</td>
              <td>
                <PaymentBadge status={payment.status} />
              </td>
              <td>{payment.provider ?? t.common.none}</td>
              <td className="mono">{payment.provider_payment_id ?? t.common.none}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
