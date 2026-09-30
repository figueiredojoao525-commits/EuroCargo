import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { CountrySelect } from '../../components/CountrySelect'
import { Field } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { ConditionBadge, DemoBadge, PriceDisplay } from '../../components/shop/Badges'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import { cart, useCart } from '../../services/cart'
import { getErrorMessage } from '../../services/errors'
import { createPartRequest, getProductsByIds } from '../../services/orders'
import { localized } from '../../utils/catalog'
import { formatMoney } from '../../utils/format'
import { isValidPhone } from '../../utils/validation'

/**
 * /carrinho — basket of catalogue parts and/or a free-text request to a specialist.
 * Sends a request (order "submitted"); EuroCargo confirms price, availability
 * and shipping before any payment.
 */
export function CartPage() {
  const { t, lang } = useI18n()
  const { user, profile } = useAuth()
  const [params] = useSearchParams()
  const lines = useCart()
  const ids = lines.map((l) => l.productId)
  const products = useAsync(() => getProductsByIds(ids), [ids.join(',')])

  const [message, setMessage] = useState(params.get('message') ?? '')
  const [vehicle, setVehicle] = useState(params.get('vehicle') ?? '')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState({ line1: '', postal_code: '', city: '', country: '' })
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<{ id: string; order_number: string } | null>(null)

  const byId = new Map(products.data?.map((p) => [p.id, p]))
  const available = lines.filter((l) => byId.get(l.productId)?.active)
  const priced = available.every((l) => byId.get(l.productId)?.price !== null)
  const total = available.reduce((sum, l) => sum + (byId.get(l.productId)?.price ?? 0) * l.quantity, 0)
  const currency = products.data?.[0]?.currency ?? 'EUR'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (available.length === 0 && !message.trim()) {
      setError(t.cart.emptyRequest)
      return
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setError(t.shipmentForm.phoneInvalid)
      return
    }
    setError('')
    setSending(true)
    try {
      const hasAddress = address.line1.trim() && address.city.trim() && address.country
      const result = await createPartRequest({
        items: available.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
        message,
        vehicle,
        phone,
        address: hasAddress ? { name: profile?.full_name ?? undefined, phone: phone || undefined, ...address } : null,
      })
      cart.clear()
      setSent(result)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="container page page-narrow">
        <div className="card stack">
          <Alert tone="success">
            <p>
              <strong>{interpolate(t.cart.sent, { number: sent.order_number })}</strong>
            </p>
            <p>{t.cart.sentText}</p>
          </Alert>
          <div className="form-actions">
            <Link to={`/pedidos/${sent.id}`} className="btn btn-primary">
              {t.cart.viewOrder}
            </Link>
            <Link to="/pecas" className="btn btn-ghost">
              {t.shop.backToShop}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container page page-narrow">
      <h1>{t.cart.title}</h1>
      <p className="muted">{t.cart.subtitle}</p>

      <section className="card">
        <h2 className="card-title">{t.cart.items}</h2>
        {products.loading && lines.length > 0 && !products.data && <Spinner />}
        {lines.length === 0 ? (
          <p className="muted">
            {t.cart.empty} <Link to="/pecas">{t.cart.browse}</Link>
          </p>
        ) : (
          <ul className="cart-lines">
            {lines.map((line) => {
              const product = byId.get(line.productId)
              if (products.data && !product?.active) {
                return (
                  <li key={line.productId} className="cart-line muted">
                    <span>{t.cart.unavailable}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => cart.remove(line.productId)}>
                      {t.cart.remove}
                    </button>
                  </li>
                )
              }
              if (!product) return null
              return (
                <li key={line.productId} className="cart-line">
                  <div className="cart-line-info">
                    <Link to={`/pecas/${product.id}`}>{localized(product.name, product.name_i18n, lang)}</Link>
                    <div className="cart-line-meta">
                      <ConditionBadge condition={product.condition} />
                      {product.is_demo && <DemoBadge />}
                      {product.part_number && <span className="muted small mono">{product.part_number}</span>}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    className="qty-input"
                    aria-label={t.cart.quantity}
                    value={line.quantity}
                    onChange={(e) => cart.setQuantity(line.productId, Number(e.target.value) || 1)}
                  />
                  <PriceDisplay price={product.price} currency={product.currency} isDemo={product.is_demo} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`${t.cart.remove}: ${product.name}`}
                    onClick={() => cart.remove(line.productId)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {available.length > 0 && (
          <p className="cart-total">
            {t.cart.estimatedTotal}: <strong>{formatMoney(total, currency, lang)}</strong>
            {!priced && <span className="muted small"> · {t.cart.someOnRequest}</span>}
          </p>
        )}
        <p className="muted small">{t.cart.priceNote}</p>
      </section>

      <form className="form mt" onSubmit={handleSubmit} noValidate>
        <fieldset className="card">
          <legend>{t.cart.requestDetails}</legend>
          <div className="form-grid">
            <div className="span-2">
              <Field label={t.cart.vehicle} htmlFor="cart-vehicle" hint={t.cart.vehicleHint}>
                <input id="cart-vehicle" maxLength={300} value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
              </Field>
            </div>
            <div className="span-2">
              <Field label={t.cart.message} htmlFor="cart-message" hint={t.cart.messageHint}>
                <textarea
                  id="cart-message"
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
            </div>
            <Field label={`${t.auth.phone} (${t.common.optional})`} htmlFor="cart-phone">
              <input
                id="cart-phone"
                type="tel"
                maxLength={30}
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend>
            {t.cart.address} ({t.common.optional})
          </legend>
          <div className="form-grid">
            <div className="span-2">
              <Field label={t.shipmentForm.address} htmlFor="cart-line1">
                <input
                  id="cart-line1"
                  maxLength={250}
                  autoComplete="street-address"
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t.cart.postalCode} htmlFor="cart-postal">
              <input
                id="cart-postal"
                maxLength={20}
                autoComplete="postal-code"
                value={address.postal_code}
                onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
              />
            </Field>
            <Field label={t.shipmentForm.city} htmlFor="cart-city">
              <input
                id="cart-city"
                maxLength={100}
                autoComplete="address-level2"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
              />
            </Field>
            <Field label={t.shipmentForm.country} htmlFor="cart-country">
              <CountrySelect
                id="cart-country"
                value={address.country}
                placeholder={t.shipmentForm.selectCountry}
                onChange={(e) => setAddress({ ...address, country: e.target.value })}
              />
            </Field>
          </div>
        </fieldset>

        {error && <Alert tone="error">{error}</Alert>}
        {user ? (
          <div className="form-actions">
            <button type="submit" className="btn btn-accent btn-lg" disabled={sending}>
              <Icon name="send" size={18} />
              {sending ? t.common.loading : t.cart.submit}
            </button>
          </div>
        ) : (
          <Alert tone="info">
            {t.cart.loginRequired}{' '}
            <Link to="/login" state={{ from: `/carrinho?${params.toString()}` }}>
              {t.nav.login}
            </Link>{' '}
            · <Link to="/register">{t.nav.register}</Link>
          </Alert>
        )}
      </form>
    </div>
  )
}
