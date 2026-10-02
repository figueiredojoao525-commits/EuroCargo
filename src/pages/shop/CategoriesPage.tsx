import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { catalogProvider } from '../../services/catalog'
import { getErrorMessage } from '../../services/errors'
import { categoryIcon, localized } from '../../utils/catalog'
import { categoryImage } from '../../utils/productImage'

/** Illustrative photo of the category (labelled; nothing when the category has no photo). */
function CategoryPhoto({ slug }: { slug: string }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const image = categoryImage(slug)
  if (!image || failed) return null
  return (
    <figure className="category-photo product-image-illustrative">
      <img
        src={image.src.replace(/-800\.webp$/, '-400.webp')}
        width={image.width}
        height={image.height}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <figcaption className="product-image-tag">{t.shop.illustrative}</figcaption>
    </figure>
  )
}

/** /categorias */
export function CategoriesPage() {
  const { t, lang } = useI18n()
  const categories = useAsync(() => catalogProvider.listCategories(), [])
  const top = categories.data?.filter((c) => !c.parent_id) ?? []

  return (
    <div className="container page">
      <header className="shop-header">
        <p className="eyebrow-pill">{t.categories.eyebrow}</p>
        <h1>{t.categories.title}</h1>
        <p className="muted">{t.categories.subtitle}</p>
      </header>
      {categories.loading && !categories.data && <Spinner />}
      {categories.error !== undefined && <Alert tone="error">{getErrorMessage(categories.error, t)}</Alert>}
      <div className="category-grid">
        {top.map((category) => (
          <Link key={category.id} to={`/pecas?category=${category.id}`} className="category-card">
            <CategoryPhoto slug={category.slug} />
            <span className="category-icon" aria-hidden="true">
              <Icon name={categoryIcon(category.icon)} size={28} />
            </span>
            <span className="category-name">{localized(category.name, category.name_i18n, lang)}</span>
            <Icon name="arrowRight" size={18} />
          </Link>
        ))}
      </div>
      {categories.data && top.length === 0 && <p className="card empty">{t.categories.empty}</p>}
    </div>
  )
}
