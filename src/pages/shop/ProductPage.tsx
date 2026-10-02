import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { AvailabilityBadge, ConditionBadge, DemoBadge, PriceDisplay } from '../../components/shop/Badges'
import { ContactSpecialist } from '../../components/shop/ContactSpecialist'
import { ProductCard } from '../../components/shop/ProductCard'
import { ProductGallery } from '../../components/shop/ProductGallery'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { illustrativeKey } from '../../utils/productImage'
import { cart } from '../../services/cart'
import { catalogProvider } from '../../services/catalog'
import { getErrorMessage } from '../../services/errors'
import { cardFromProduct, compatibilityLabel, localized } from '../../utils/catalog'
import { formatDate } from '../../utils/format'

export function ProductPage() {
  const { t, lang } = useI18n()
  const { id = '' } = useParams()
  const product = useAsync(() => catalogProvider.getProduct(id), [id])
  const alternatives = useAsync(
    () => (product.data ? catalogProvider.getAlternatives(product.data) : Promise.resolve([])),
    [product.data],
  )
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  if (product.loading && !product.data) return <Spinner />
  if (product.error !== undefined || !product.data) {
    return (
      <div className="container page page-narrow">
        <Alert tone="error">
          {product.error !== undefined ? getErrorMessage(product.error, t) : t.errors.productNotFound}
        </Alert>
        <Link to="/pecas" className="back-link mt">
          <Icon name="arrowLeft" size={18} />
          {t.shop.backToShop}
        </Link>
      </div>
    )
  }

  const p = product.data
  const name = localized(p.name, p.name_i18n, lang)
  const firstCompat = p.product_vehicle_compatibility[0]
  const specs = Object.entries(p.specs ?? {})

  return (
    <div className="container page product-page">
      <Link to="/pecas" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.shop.backToShop}
      </Link>

      {p.is_demo && <Alert tone="warning">{t.shop.demoProductNotice}</Alert>}

      <div className="product-main">
        <ProductGallery
          images={p.product_images}
          name={name}
          categorySlug={p.category?.slug}
          illustrativeKey={illustrativeKey(p.category?.slug, p.name)}
        />

        <div className="product-info">
          <div className="product-badges">
            <ConditionBadge condition={p.condition} />
            <AvailabilityBadge availability={p.availability} leadTimeDays={p.lead_time_days} />
            {p.is_demo && <DemoBadge />}
          </div>
          <h1>{name}</h1>
          {p.category && <p className="muted">{localized(p.category.name, p.category.name_i18n, lang)}</p>}

          <dl className="detail-list">
            {p.brand && (
              <>
                <dt>{t.shop.brand}</dt>
                <dd>{p.brand.name}</dd>
              </>
            )}
            {p.manufacturer && p.manufacturer !== p.brand?.name && (
              <>
                <dt>{t.shop.manufacturer}</dt>
                <dd>{p.manufacturer}</dd>
              </>
            )}
            {p.part_number && (
              <>
                <dt>{t.shop.reference}</dt>
                <dd className="mono">{p.part_number}</dd>
              </>
            )}
            {p.oe_numbers.length > 0 && (
              <>
                <dt>{t.shop.oe}</dt>
                <dd className="mono">{p.oe_numbers.join(', ')}</dd>
              </>
            )}
          </dl>

          <PriceDisplay price={p.price} currency={p.currency} isDemo={p.is_demo} size="lg" />

          <div className="product-actions">
            <label htmlFor="qty" className="sr-only">
              {t.cart.quantity}
            </label>
            <input
              id="qty"
              type="number"
              min={1}
              max={99}
              value={quantity}
              className="qty-input"
              onChange={(e) => setQuantity(Math.min(Math.max(Number(e.target.value) || 1, 1), 99))}
            />
            <button
              type="button"
              className="btn btn-accent btn-lg"
              disabled={p.availability === 'out_of_stock'}
              onClick={() => {
                cart.add(p.id, quantity)
                setAdded(true)
              }}
            >
              <Icon name="cart" size={18} />
              {p.price === null ? t.shop.requestQuote : t.shop.addToRequest}
            </button>
          </div>
          {added && (
            <Alert tone="success">
              {t.shop.added} <Link to="/carrinho">{t.shop.viewRequest}</Link>
            </Alert>
          )}

          <ContactSpecialist
            context={{
              product: name,
              vehicle: firstCompat
                ? [firstCompat.make?.name, firstCompat.model?.name].filter(Boolean).join(' ')
                : undefined,
              reference: p.part_number ?? undefined,
              condition: p.condition,
            }}
          />
        </div>
      </div>

      {alternatives.data && alternatives.data.length > 0 && (
        <section className="section-block">
          <h2>{t.shop.alsoAvailable}</h2>
          <div className="product-grid">
            {alternatives.data.map((alt) => (
              <ProductCard key={alt.id} product={cardFromProduct(alt, lang)} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-2 section-block">
        <section className="card">
          <h2 className="card-title">{t.shop.compatibility}</h2>
          {p.product_vehicle_compatibility.length === 0 ? (
            <p className="muted">{t.shop.noCompatibility}</p>
          ) : (
            <ul className="compat-list">
              {p.product_vehicle_compatibility.map((c) => (
                <li key={c.id}>
                  <Icon name="car" size={18} />
                  <span>
                    {compatibilityLabel({
                      make: c.make?.name ?? null,
                      model: c.model?.name ?? null,
                      variant: c.variant?.name,
                      year_from: c.year_from,
                      year_to: c.year_to,
                      position: c.position,
                    })}
                    {c.notes && <small className="muted"> — {c.notes}</small>}
                  </span>
                  {c.verified && <span className="badge badge-delivered">{t.shop.verified}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">{t.shop.compatibilityHint}</p>
        </section>

        <section className="card">
          <h2 className="card-title">{t.shop.details}</h2>
          {p.description && <p>{p.description}</p>}
          {specs.length > 0 && (
            <dl className="detail-list">
              {specs.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="muted small">
            {t.shop.updated} {formatDate(p.updated_at, lang)}
          </p>
        </section>
      </div>
    </div>
  )
}
