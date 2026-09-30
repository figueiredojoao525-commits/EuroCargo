import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { catalogProvider } from '../../services/catalog'
import { getErrorMessage } from '../../services/errors'
import { categoryIcon, localized } from '../../utils/catalog'

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
