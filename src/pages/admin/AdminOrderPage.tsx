import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { AdminShipmentForm } from '../../components/admin/AdminShipmentForm'
import { ProductPicker } from '../../components/admin/ProductPicker'
import { TrackingCodeTools } from '../../components/admin/TrackingCodeTools'
import { Field } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { OrderStatusBadge, StatusBadge } from '../../components/StatusBadge'
import { ConditionBadge } from '../../components/shop/Badges'
import { useAsync } from '../../hooks/useAsync'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import {
  addOrderEvent,
  addOrderNote,
  deleteOrderItem,
  getOrderForAdmin,
  saveOrder,
  saveOrderItem,
} from '../../services/adminOrders'
import { getErrorMessage } from '../../services/errors'
import { whatsappService } from '../../services/whatsapp'
import { ORDER_STATUSES, type OrderStatus, type ShipmentStatus } from '../../types'
import { localized } from '../../utils/catalog'
import { formatDateTime, formatMoney } from '../../utils/format'

/** /admin/orders/:id — the operational hub for one order. */
export function AdminOrderPage() {
  const { t, lang } = useI18n()
  const { id = '' } = useParams()
  const bundle = useAsync(() => getOrderForAdmin(id), [id])
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [customerNote, setCustomerNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [shipping, setShipping] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [showShipmentForm, setShowShipmentForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (bundle.loading && !bundle.data) return <Spinner />
  if (bundle.error !== undefined || !bundle.data) {
    return (
      <Alert tone="error">{bundle.error !== undefined ? getErrorMessage(bundle.error, t) : t.orders.notFound}</Alert>
    )
  }

  const { order, items, events, notes, shipment } = bundle.data
  const money = (v: number) => formatMoney(v, order.currency, lang)
  const address = order.shipping_address

  async function run(action: () => Promise<unknown>, success = t.adminCommon.saved) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(success)
      bundle.reload()
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const statusText = interpolate(t.adminOrders.whatsappStatus, {
    number: order.order_number,
    status: t.orderStatus[order.status],
  })
  const whatsappLink = whatsappService.linkTo(order.customer?.phone ?? address?.phone, statusText)

  return (
    <>
      <Link to="/admin/orders" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.common.back}
      </Link>
      <div className="page-header">
        <div>
          <p className="muted eyebrow">
            {t.channel[order.channel]} · {formatDateTime(order.created_at, lang)}
          </p>
          <h1 className="mono">{order.order_number}</h1>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="stack">
        <div className="grid grid-2">
          <section className="card">
            <h2 className="card-title">{t.adminOrders.customer}</h2>
            <dl className="detail-list">
              <dt>{t.auth.fullName}</dt>
              <dd>{order.customer?.full_name ?? t.common.none}</dd>
              <dt>{t.auth.phone}</dt>
              <dd>{order.customer?.phone ?? t.common.none}</dd>
              <dt>{t.auth.email}</dt>
              <dd>{order.customer?.email ?? t.common.none}</dd>
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
              {address && (
                <>
                  <dt>{t.cart.address}</dt>
                  <dd>
                    {[
                      address.name,
                      address.line1,
                      address.line2,
                      [address.postal_code, address.city].filter(Boolean).join(' '),
                      address.country,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </dd>
                </>
              )}
            </dl>
            {whatsappLink && (
              <a className="btn btn-whatsapp btn-sm" href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <Icon name="chat" size={16} />
                {t.adminOrders.whatsappCustomer}
              </a>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">{t.dashboard.status}</h2>
            <div className="input-row">
              <label htmlFor="o-status" className="sr-only">
                {t.dashboard.status}
              </label>
              <select
                id="o-status"
                value={status || order.status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t.orderStatus[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !status || status === order.status}
                onClick={() =>
                  run(async () => {
                    await saveOrder({ status }, order.id)
                    setStatus('')
                  })
                }
              >
                {t.adminCommon.save}
              </button>
            </div>
            <Field label={t.adminOrders.messageToCustomer} htmlFor="o-cnote" hint={t.adminOrders.messageToCustomerHint}>
              <textarea
                id="o-cnote"
                maxLength={1000}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy || !customerNote.trim()}
              onClick={() =>
                run(async () => {
                  await addOrderEvent(order.id, order.status, customerNote.trim())
                  setCustomerNote('')
                })
              }
            >
              {t.adminOrders.sendMessage}
            </button>
            <h3 className="mt">{t.shipment.history}</h3>
            <ol className="timeline">
              {events.map((e, i) => (
                <li key={e.id} className={i === 0 ? 'current' : ''}>
                  <div className="timeline-title">{t.orderStatus[e.status]}</div>
                  <div className="timeline-meta">{formatDateTime(e.created_at, lang)}</div>
                  {e.note && <p>{e.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

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
                  <th>
                    <span className="sr-only">{t.adminCommon.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.description}
                      <div className="cart-line-meta">
                        {item.condition && <ConditionBadge condition={item.condition} />}
                        {item.part_number && <span className="muted small mono">{item.part_number}</span>}
                      </div>
                    </td>
                    <td>{item.quantity}</td>
                    <td>
                      <div className="input-row compact">
                        <input
                          aria-label={t.orders.unitPrice}
                          inputMode="decimal"
                          className="price-input"
                          value={prices[item.id] ?? (item.unit_price === null ? '' : String(item.unit_price))}
                          placeholder={t.orders.toQuote}
                          onChange={(e) => setPrices({ ...prices, [item.id]: e.target.value })}
                        />
                        {prices[item.id] !== undefined && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                const v = prices[item.id].trim()
                                await saveOrderItem(
                                  { unit_price: v === '' ? null : Number(v.replace(',', '.')) },
                                  item.id,
                                )
                                setPrices((current) => {
                                  const next = { ...current }
                                  delete next[item.id]
                                  return next
                                })
                              })
                            }
                          >
                            {t.adminCommon.save}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="nowrap">{item.unit_price === null ? t.common.none : money(item.line_total)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={t.cart.remove}
                        onClick={() => run(() => deleteOrderItem(item.id))}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt">
            <ProductPicker
              onPick={(p) =>
                run(() =>
                  saveOrderItem({
                    order_id: order.id,
                    product_id: p.id,
                    description: localized(p.name, p.name_i18n, lang),
                    part_number: p.part_number,
                    condition: p.condition,
                    quantity: 1,
                    unit_price: p.price,
                  }),
                )
              }
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm mt"
              onClick={() =>
                run(() => saveOrderItem({ order_id: order.id, description: t.adminOrders.newItem, quantity: 1 }))
              }
            >
              <Icon name="plus" size={16} />
              {t.adminOrders.freeItem}
            </button>
          </div>
          <dl className="detail-list totals">
            <dt>{t.orders.subtotal}</dt>
            <dd>{money(order.subtotal)}</dd>
            <dt>{t.orders.shipping}</dt>
            <dd>
              <div className="input-row compact">
                <input
                  aria-label={t.orders.shipping}
                  inputMode="decimal"
                  className="price-input"
                  value={shipping ?? String(order.shipping_amount)}
                  onChange={(e) => setShipping(e.target.value)}
                />
                {shipping !== null && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await saveOrder({ shipping_amount: Number(shipping.replace(',', '.')) || 0 }, order.id)
                        setShipping(null)
                      })
                    }
                  >
                    {t.adminCommon.save}
                  </button>
                )}
              </div>
            </dd>
            <dt>{t.orders.total}</dt>
            <dd>
              <strong>{money(order.total)}</strong>
            </dd>
          </dl>
        </section>

        <section className="card">
          <h2 className="card-title">{t.adminOrders.transport}</h2>
          {shipment ? (
            <>
              <p>
                <StatusBadge status={shipment.status as ShipmentStatus} />{' '}
                <Link to={`/admin/shipments/${shipment.id}`}>{t.adminOrders.openShipment}</Link>
              </p>
              <TrackingCodeTools
                shipmentId={shipment.id}
                code={shipment.tracking_code}
                recipientPhone={order.customer?.phone ?? address?.phone}
                onGenerated={bundle.reload}
              />
            </>
          ) : showShipmentForm ? (
            <AdminShipmentForm
              customerId={order.customer_id}
              orderId={order.id}
              description={items
                .map((i) => i.description)
                .join(', ')
                .slice(0, 500)}
              recipient={{
                name: address?.name ?? order.customer?.full_name ?? '',
                phone: address?.phone ?? order.customer?.phone ?? '',
                country: address?.country ?? '',
                city: address?.city ?? '',
                address: [address?.line1, address?.line2, address?.postal_code].filter(Boolean).join(', '),
              }}
              onCreated={(r) => {
                setShowShipmentForm(false)
                setNotice(
                  r.tracking_code
                    ? interpolate(t.adminShipments.createdWithCode, { code: r.tracking_code })
                    : t.adminShipments.created,
                )
                bundle.reload()
              }}
            />
          ) : (
            <div className="stack">
              <p className="muted">{t.adminOrders.noShipment}</p>
              <div>
                <button type="button" className="btn btn-accent" onClick={() => setShowShipmentForm(true)}>
                  <Icon name="truck" size={18} />
                  {t.adminOrders.createShipment}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">{t.adminOrders.internalNotes}</h2>
          <p className="muted small">{t.adminOrders.internalNotesHint}</p>
          <div className="input-row">
            <label htmlFor="o-inote" className="sr-only">
              {t.adminOrders.internalNotes}
            </label>
            <input
              id="o-inote"
              maxLength={2000}
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy || !internalNote.trim()}
              onClick={() =>
                run(async () => {
                  await addOrderNote(order.id, internalNote.trim())
                  setInternalNote('')
                })
              }
            >
              {t.adminCommon.add}
            </button>
          </div>
          <ul className="notes-list">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="muted small">{formatDateTime(n.created_at, lang)}</span>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
