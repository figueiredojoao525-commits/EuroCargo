import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { Spinner } from '../components/Spinner'
import { OrderStatusBadge, PaymentBadge, StatusBadge } from '../components/StatusBadge'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../hooks/useAuth'
import { interpolate } from '../i18n'
import { useI18n } from '../i18n/context'
import { getErrorMessage } from '../services/errors'
import { listMyOrders } from '../services/orders'
import { latestPaymentStatus, listMyShipments } from '../services/shipments'
import { formatDate, formatMoney } from '../utils/format'

export function DashboardPage() {
  const { t, lang } = useI18n()
  const { user, profile } = useAuth()
  const userId = user?.id ?? ''
  const { data: shipments, error, loading } = useAsync(() => listMyShipments(userId), [userId])
  const orders = useAsync(listMyOrders, [userId])

  const name = profile?.full_name || user?.email || ''

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <p className="muted eyebrow">{interpolate(t.dashboard.welcome, { name })}</p>
          <h1>{t.dashboard.title}</h1>
        </div>
        <Link to="/shipments/new" className="btn btn-primary">
          {t.dashboard.newShipment}
        </Link>
      </div>

      <section className="dashboard-section">
        <div className="page-header">
          <h2>{t.orders.myOrders}</h2>
          <Link to="/pecas" className="btn btn-outline">
            {t.orders.findPart}
          </Link>
        </div>
        {orders.error !== undefined && <Alert tone="error">{getErrorMessage(orders.error, t)}</Alert>}
        {orders.data && orders.data.length === 0 && <p className="card empty">{t.orders.empty}</p>}
        {orders.data && orders.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.dashboard.date}</th>
                  <th>{t.orders.order}</th>
                  <th>{t.dashboard.status}</th>
                  <th>{t.orders.total}</th>
                  <th>
                    <span className="sr-only">{t.common.details}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.data.map((order) => (
                  <tr key={order.id}>
                    <td className="nowrap">{formatDate(order.created_at, lang)}</td>
                    <td className="mono nowrap">{order.order_number}</td>
                    <td>
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="nowrap">{formatMoney(order.total, order.currency, lang)}</td>
                    <td>
                      <Link to={`/pedidos/${order.id}`} className="btn btn-outline btn-sm">
                        {t.common.details}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 className="mt">{t.dashboard.myShipments}</h2>
      {loading && !shipments && <Spinner />}
      {error !== undefined && <Alert tone="error">{getErrorMessage(error, t)}</Alert>}

      {shipments && shipments.length === 0 && (
        <div className="card empty">
          <p>{t.dashboard.empty}</p>
          <Link to="/shipments/new" className="btn btn-primary">
            {t.dashboard.newShipment}
          </Link>
        </div>
      )}

      {shipments && shipments.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.dashboard.date}</th>
                <th>{t.dashboard.route}</th>
                <th>{t.dashboard.status}</th>
                <th>{t.dashboard.trackingCode}</th>
                <th>{t.dashboard.payment}</th>
                <th>
                  <span className="sr-only">{t.common.details}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => {
                const paymentStatus = latestPaymentStatus(shipment)
                return (
                  <tr key={shipment.id}>
                    <td className="nowrap">{formatDate(shipment.created_at, lang)}</td>
                    <td>
                      {shipment.sender_city} ({shipment.sender_country}) → {shipment.recipient_city} (
                      {shipment.recipient_country})
                    </td>
                    <td>
                      <StatusBadge status={shipment.status} />
                    </td>
                    <td className="mono nowrap">{shipment.tracking_code ?? t.common.none}</td>
                    <td>{paymentStatus ? <PaymentBadge status={paymentStatus} /> : t.common.none}</td>
                    <td>
                      <Link to={`/shipments/${shipment.id}`} className="btn btn-outline btn-sm">
                        {t.common.details}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
