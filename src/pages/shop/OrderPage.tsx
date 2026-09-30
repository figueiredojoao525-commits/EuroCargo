import { Link, useParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { OrderStatusBadge } from '../../components/StatusBadge'
import { ConditionBadge } from '../../components/shop/Badges'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { getErrorMessage } from '../../services/errors'
import { getMyOrder } from '../../services/orders'
import { formatDateTime, formatMoney } from '../../utils/format'

/** /pedidos/:id — customer view of one of their orders (RLS hides others). */
export function OrderPage() {
  const { t, lang } = useI18n()
  const { id = '' } = useParams()
  const { data, error, loading } = useAsync(() => getMyOrder(id), [id])

  if (loading && !data) return <Spinner />
  if (error !== undefined || !data) {
    return (
      <div className="container page page-narrow">
        <Alert tone="error">{error !== undefined ? getErrorMessage(error, t) : t.orders.notFound}</Alert>
      </div>
    )
  }

  const { order, items, events, trackingCode } = data
  const money = (value: number) => formatMoney(value, order.currency, lang)

  return (
    <div className="container page">
      <Link to="/dashboard" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.common.back}
      </Link>
      <div className="page-header">
        <div>
          <p className="muted eyebrow">{t.orders.order}</p>
          <h1 className="mono">{order.order_number}</h1>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="stack">
        {trackingCode && (
          <section className="card">
            <h2 className="card-title">{t.shipment.trackingCode}</h2>
            <div className="form-actions">
              <span className="tracking-code-display">{trackingCode}</span>
              <Link to={`/rastrear?code=${trackingCode}`} className="btn btn-outline btn-sm">
                {t.shipment.viewTracking}
              </Link>
            </div>
          </section>
        )}

        <section className="card">
          <h2 className="card-title">{t.orders.items}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.orders.item}</th>
                  <th>{t.cart.quantity}</th>
                  <th>{t.orders.unitPrice}</th>
                  <th>{t.orders.lineTotal}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.product_id ? (
                        <Link to={`/pecas/${item.product_id}`}>{item.description}</Link>
                      ) : (
                        item.description
                      )}
                      <div className="cart-line-meta">
                        {item.condition && <ConditionBadge condition={item.condition} />}
                        {item.part_number && <span className="muted small mono">{item.part_number}</span>}
                      </div>
                    </td>
                    <td>{item.quantity}</td>
                    <td className="nowrap">{item.unit_price === null ? t.orders.toQuote : money(item.unit_price)}</td>
                    <td className="nowrap">{item.unit_price === null ? t.common.none : money(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="detail-list totals">
            <dt>{t.orders.subtotal}</dt>
            <dd>{money(order.subtotal)}</dd>
            <dt>{t.orders.shipping}</dt>
            <dd>{money(order.shipping_amount)}</dd>
            <dt>{t.orders.total}</dt>
            <dd>
              <strong>{money(order.total)}</strong>
            </dd>
          </dl>
        </section>

        {(order.vehicle_info || order.customer_message) && (
          <section className="card">
            <h2 className="card-title">{t.cart.requestDetails}</h2>
            <dl className="detail-list">
              {order.vehicle_info && (
                <>
                  <dt>{t.cart.vehicle}</dt>
                  <dd>{order.vehicle_info}</dd>
                </>
              )}
              {order.customer_message && (
                <>
                  <dt>{t.cart.message}</dt>
                  <dd>{order.customer_message}</dd>
                </>
              )}
            </dl>
          </section>
        )}

        <section className="card">
          <h2 className="card-title">{t.shipment.history}</h2>
          <ol className="timeline">
            {events.map((event, index) => (
              <li key={event.id} className={index === 0 ? 'current' : ''}>
                <div className="timeline-title">{t.orderStatus[event.status]}</div>
                <div className="timeline-meta">
                  <time dateTime={event.created_at}>{formatDateTime(event.created_at, lang)}</time>
                </div>
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
