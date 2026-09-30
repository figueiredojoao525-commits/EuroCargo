import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { ProductPicker } from '../../components/admin/ProductPicker'
import { CountrySelect } from '../../components/CountrySelect'
import { Field } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { getCustomer, listCustomers, saveCustomer, saveOrder, saveOrderItem } from '../../services/adminOrders'
import { getErrorMessage } from '../../services/errors'
import {
  ORDER_CHANNELS,
  ORDER_STATUSES,
  type Customer,
  type OrderChannel,
  type OrderStatus,
  type PartCondition,
} from '../../types'
import { localized } from '../../utils/catalog'
import { formatMoney } from '../../utils/format'

interface Line {
  key: number
  productId: string | null
  description: string
  partNumber: string
  condition: PartCondition | ''
  quantity: string
  unitPrice: string
}

const price = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

/**
 * /admin/orders/new — order taken by WhatsApp, phone, in person, e-mail...
 * The admin sets prices here (they are the agreed prices for this order).
 */
export function AdminOrderNewPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const found = useAsync(
    () => (customerQuery ? listCustomers(customerQuery, 0) : Promise.resolve(null)),
    [customerQuery],
  )
  const presetId = params.get('customer')
  const preset = useAsync(() => (presetId ? getCustomer(presetId) : Promise.resolve(null)), [presetId])

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [newCustomer, setNewCustomer] = useState({ full_name: '', phone: '', email: '' })
  const [channel, setChannel] = useState<OrderChannel>('whatsapp')
  const [status, setStatus] = useState<OrderStatus>('confirmed')
  const [vehicle, setVehicle] = useState('')
  const [message, setMessage] = useState('')
  const [address, setAddress] = useState({ name: '', phone: '', line1: '', postal_code: '', city: '', country: '' })
  const [shipping, setShipping] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [nextKey, setNextKey] = useState(1)

  const presetCustomer = preset.data ?? null
  const selected = customer ?? presetCustomer

  function addLine(line: Omit<Line, 'key'>) {
    setLines((ls) => [...ls, { ...line, key: nextKey }])
    setNextKey((k) => k + 1)
  }
  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const subtotal = lines.reduce((sum, l) => sum + (price(l.unitPrice) ?? 0) * (Number(l.quantity) || 1), 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selected && newCustomer.full_name.trim().length < 1) {
      setError(t.adminOrders.customerRequired)
      return
    }
    if (lines.some((l) => !l.description.trim())) {
      setError(t.adminOrders.itemDescriptionRequired)
      return
    }
    setSaving(true)
    setError('')
    try {
      const target =
        selected ??
        (await saveCustomer({
          full_name: newCustomer.full_name.trim(),
          phone: newCustomer.phone.trim() || null,
          email: newCustomer.email.trim() || null,
          source: channel,
        }))
      const hasAddress = address.line1.trim() && address.city.trim() && address.country
      const order = await saveOrder({
        customer_id: target.id,
        channel,
        status,
        vehicle_info: vehicle.trim() || null,
        customer_message: message.trim() || null,
        shipping_amount: price(shipping) ?? 0,
        shipping_address: hasAddress
          ? Object.fromEntries(
              Object.entries({ ...address, name: address.name || target.full_name }).filter(([, v]) => v),
            )
          : null,
      })
      for (const l of lines) {
        await saveOrderItem({
          order_id: order.id,
          product_id: l.productId,
          description: l.description.trim(),
          part_number: l.partNumber.trim() || null,
          condition: l.condition || null,
          quantity: Math.min(Math.max(Number(l.quantity) || 1, 1), 999),
          unit_price: price(l.unitPrice),
        })
      }
      navigate(`/admin/orders/${order.id}`, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, t))
      setSaving(false)
    }
  }

  return (
    <>
      <Link to="/admin/orders" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.common.back}
      </Link>
      <h1>{t.adminOrders.newOrder}</h1>
      <p className="muted">{t.adminOrders.newIntro}</p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <fieldset className="card">
          <legend>{t.adminOrders.customer}</legend>
          {selected ? (
            <div className="form-actions">
              <strong>{selected.full_name}</strong>
              <span className="muted">{[selected.phone, selected.email].filter(Boolean).join(' · ')}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setCustomer(null)
                  navigate('/admin/orders/new', { replace: true })
                }}
              >
                {t.adminOrders.changeCustomer}
              </button>
            </div>
          ) : (
            <>
              <div className="input-row">
                <label htmlFor="c-search" className="sr-only">
                  {t.adminCustomers.search}
                </label>
                <input
                  id="c-search"
                  type="search"
                  placeholder={t.adminCustomers.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setCustomerQuery(search.trim())
                    }
                  }}
                />
                <button type="button" className="btn btn-outline" onClick={() => setCustomerQuery(search.trim())}>
                  {t.shop.searchButton}
                </button>
              </div>
              {found.data && (
                <ul className="picker-results">
                  {found.data.rows.length === 0 && <li className="muted small">{t.adminCommon.empty}</li>}
                  {found.data.rows.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setCustomer(c)}>
                        <span>{c.full_name}</span>
                        <span className="muted small">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small mt">{t.adminOrders.orNewCustomer}</p>
              <div className="form-grid">
                <Field label={t.auth.fullName} htmlFor="nc-name">
                  <input
                    id="nc-name"
                    maxLength={120}
                    value={newCustomer.full_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                  />
                </Field>
                <Field label={t.auth.phone} htmlFor="nc-phone">
                  <input
                    id="nc-phone"
                    type="tel"
                    maxLength={30}
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                </Field>
                <Field label={t.auth.email} htmlFor="nc-email">
                  <input
                    id="nc-email"
                    type="email"
                    maxLength={200}
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  />
                </Field>
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="card">
          <legend>{t.orders.order}</legend>
          <div className="form-grid">
            <Field label={t.adminOrders.channel} htmlFor="o-channel">
              <select id="o-channel" value={channel} onChange={(e) => setChannel(e.target.value as OrderChannel)}>
                {ORDER_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {t.channel[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.dashboard.status} htmlFor="o-status">
              <select id="o-status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t.orderStatus[s]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="span-2">
              <Field label={t.cart.vehicle} htmlFor="o-vehicle">
                <input id="o-vehicle" maxLength={300} value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
              </Field>
            </div>
            <div className="span-2">
              <Field label={t.cart.message} htmlFor="o-message">
                <textarea
                  id="o-message"
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend>{t.orders.items}</legend>
          <ProductPicker
            onPick={(item) =>
              addLine({
                productId: item.id,
                description: localized(item.name, item.name_i18n, lang),
                partNumber: item.part_number ?? '',
                condition: item.condition,
                quantity: '1',
                unitPrice: item.price === null ? '' : String(item.price),
              })
            }
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm mt"
            onClick={() =>
              addLine({ productId: null, description: '', partNumber: '', condition: '', quantity: '1', unitPrice: '' })
            }
          >
            <Icon name="plus" size={16} />
            {t.adminOrders.freeItem}
          </button>
          {lines.length > 0 && (
            <ul className="order-lines">
              {lines.map((l) => (
                <li key={l.key} className="order-line">
                  <input
                    aria-label={t.orders.item}
                    placeholder={t.orders.item}
                    maxLength={300}
                    value={l.description}
                    onChange={(e) => updateLine(l.key, { description: e.target.value })}
                  />
                  <input
                    aria-label={t.shop.reference}
                    placeholder={t.shop.reference}
                    maxLength={80}
                    value={l.partNumber}
                    onChange={(e) => updateLine(l.key, { partNumber: e.target.value })}
                  />
                  <select
                    aria-label={t.shop.condition}
                    value={l.condition}
                    onChange={(e) => updateLine(l.key, { condition: e.target.value as Line['condition'] })}
                  >
                    <option value="">{t.common.none}</option>
                    <option value="new">{t.condition.new}</option>
                    <option value="used">{t.condition.used}</option>
                  </select>
                  <input
                    aria-label={t.cart.quantity}
                    inputMode="numeric"
                    className="qty-input"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  />
                  <input
                    aria-label={t.orders.unitPrice}
                    placeholder={t.orders.unitPrice}
                    inputMode="decimal"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={t.cart.remove}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="form-grid mt">
            <Field label={t.orders.shipping} htmlFor="o-shipping">
              <input
                id="o-shipping"
                inputMode="decimal"
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
              />
            </Field>
            <p className="cart-total">
              {t.orders.total}: <strong>{formatMoney(subtotal + (price(shipping) ?? 0), 'EUR', lang)}</strong>
            </p>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend>
            {t.cart.address} ({t.common.optional})
          </legend>
          <div className="form-grid">
            <Field label={t.shipmentForm.name} htmlFor="a-name">
              <input
                id="a-name"
                maxLength={120}
                value={address.name}
                onChange={(e) => setAddress({ ...address, name: e.target.value })}
              />
            </Field>
            <Field label={t.auth.phone} htmlFor="a-phone">
              <input
                id="a-phone"
                type="tel"
                maxLength={30}
                value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
              />
            </Field>
            <div className="span-2">
              <Field label={t.shipmentForm.address} htmlFor="a-line1">
                <input
                  id="a-line1"
                  maxLength={250}
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t.cart.postalCode} htmlFor="a-postal">
              <input
                id="a-postal"
                maxLength={20}
                value={address.postal_code}
                onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
              />
            </Field>
            <Field label={t.shipmentForm.city} htmlFor="a-city">
              <input
                id="a-city"
                maxLength={100}
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
              />
            </Field>
            <Field label={t.shipmentForm.country} htmlFor="a-country">
              <CountrySelect
                id="a-country"
                value={address.country}
                placeholder={t.shipmentForm.selectCountry}
                onChange={(e) => setAddress({ ...address, country: e.target.value })}
              />
            </Field>
          </div>
        </fieldset>

        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? t.common.loading : t.adminOrders.create}
          </button>
        </div>
      </form>
    </>
  )
}
