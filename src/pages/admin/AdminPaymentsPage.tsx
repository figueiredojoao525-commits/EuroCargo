import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Field } from '../../components/Field'
import { Pagination } from '../../components/Pagination'
import { PaymentsTable } from '../../components/PaymentsTable'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { ADMIN_PAGE_SIZE, listPayments } from '../../services/admin'
import { getErrorMessage } from '../../services/errors'
import { PAYMENT_STATUSES, type PaymentStatus } from '../../types'

export function AdminPaymentsPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<PaymentStatus | ''>('')
  const [page, setPage] = useState(0)
  const { data, error, loading } = useAsync(() => listPayments(status, page), [status, page])

  return (
    <>
      <h1>{t.admin.payments}</h1>
      <div className="card filters">
        <Field label={t.admin.paymentsFilter} htmlFor="p-status">
          <select
            id="p-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PaymentStatus | '')
              setPage(0)
            }}
          >
            <option value="">{t.admin.filters.all}</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t.paymentStatus[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {loading && !data && <Spinner />}
      {error !== undefined && <Alert tone="error">{getErrorMessage(error, t)}</Alert>}
      {data && (
        <>
          <PaymentsTable
            payments={data.rows}
            shipmentCell={(payment) => {
              const shipment = payment.shipments
              return (
                <Link to={`/admin/shipments/${payment.shipment_id}`} className="mono">
                  {shipment?.tracking_code ?? payment.shipment_id.slice(0, 8)}
                </Link>
              )
            }}
          />
          <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}
    </>
  )
}
