import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/context'
import type { ProductCardData } from '../../utils/catalog'
import { AvailabilityBadge, ConditionBadge, DemoBadge, PriceDisplay } from './Badges'
import { ProductIllustration } from './ProductIllustration'

export function ProductCard({ product }: { product: ProductCardData }) {
  const { t } = useI18n()
  return (
    <article className="product-card">
      <Link to={`/pecas/${product.id}`} className="product-card-link">
        <div className="product-card-media">
          {product.image ? (
            <img src={product.image} alt="" loading="lazy" decoding="async" />
          ) : (
            <ProductIllustration categorySlug={product.categorySlug} />
          )}
          <div className="product-card-badges">
            <ConditionBadge condition={product.condition} />
            {product.isDemo && <DemoBadge />}
          </div>
        </div>
        <div className="product-card-body">
          <h3 className="product-card-title">{product.name}</h3>
          {product.compatibility && <p className="product-card-compat">{product.compatibility}</p>}
          <p className="product-card-meta">
            {[product.brand, product.partNumber && `${t.shop.ref} ${product.partNumber}`].filter(Boolean).join(' · ')}
          </p>
          <div className="product-card-footer">
            <PriceDisplay price={product.price} currency={product.currency} isDemo={product.isDemo} />
            <AvailabilityBadge availability={product.availability} leadTimeDays={product.leadTimeDays} />
          </div>
        </div>
      </Link>
    </article>
  )
}
