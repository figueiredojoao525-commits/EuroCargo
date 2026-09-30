import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Pagination } from '../../components/Pagination'
import { Spinner } from '../../components/Spinner'
import { AvailabilityBadge, ConditionBadge, DemoBadge } from '../../components/shop/Badges'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import {
  ADMIN_LIST_SIZE,
  EMPTY_PRODUCT_FILTERS,
  listCategoriesAdmin,
  listProducts,
  type ProductFilters,
} from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import { formatMoney } from '../../utils/format'

/** /admin/products */
export function AdminProductsPage() {
  const { t, lang } = useI18n()
  const [draft, setDraft] = useState<ProductFilters>(EMPTY_PRODUCT_FILTERS)
  const [filters, setFilters] = useState<ProductFilters>(EMPTY_PRODUCT_FILTERS)
  const [page, setPage] = useState(0)
  const categories = useAsync(listCategoriesAdmin, [])
  const products = useAsync(() => listProducts(filters, page), [filters, page])

  function apply(event: FormEvent) {
    event.preventDefault()
    setFilters(draft)
    setPage(0)
  }

  return (
    <>
      <div className="page-header">
        <h1>{t.adminNav.products}</h1>
        <Link to="/admin/products/new" className="btn btn-primary">
          <Icon name="plus" size={18} />
          {t.adminProducts.new}
        </Link>
      </div>

      <form className="filters" onSubmit={apply}>
        <input
          type="search"
          aria-label={t.adminProducts.search}
          placeholder={t.adminProducts.search}
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
        <select
          aria-label={t.shop.category}
          value={draft.categoryId}
          onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
        >
          <option value="">{t.shop.allCategories}</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t.shop.condition}
          value={draft.condition}
          onChange={(e) => setDraft({ ...draft, condition: e.target.value as ProductFilters['condition'] })}
        >
          <option value="">{t.shop.allConditions}</option>
          <option value="new">{t.condition.new}</option>
          <option value="used">{t.condition.used}</option>
        </select>
        <select
          aria-label={t.adminCommon.active}
          value={draft.active}
          onChange={(e) => setDraft({ ...draft, active: e.target.value as ProductFilters['active'] })}
        >
          <option value="">{t.admin.filters.all}</option>
          <option value="true">{t.adminCommon.active}</option>
          <option value="false">{t.adminCommon.inactive}</option>
        </select>
        <button type="submit" className="btn btn-outline">
          {t.admin.filters.apply}
        </button>
      </form>

      {products.error !== undefined && <Alert tone="error">{getErrorMessage(products.error, t)}</Alert>}
      {products.loading && !products.data && <Spinner />}
      {products.data && products.data.rows.length === 0 && <p className="card empty">{t.adminCommon.empty}</p>}
      {products.data && products.data.rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.adminCommon.name}</th>
                  <th>{t.shop.reference}</th>
                  <th>{t.shop.condition}</th>
                  <th>{t.adminProducts.price}</th>
                  <th>{t.adminProducts.availability}</th>
                  <th>{t.adminCommon.active}</th>
                  <th>
                    <span className="sr-only">{t.adminCommon.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.data.rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name} {p.is_demo && <DemoBadge />}
                    </td>
                    <td className="mono small">{p.part_number ?? t.common.none}</td>
                    <td>
                      <ConditionBadge condition={p.condition} />
                    </td>
                    <td className="nowrap">
                      {p.price === null ? t.shop.priceOnRequest : formatMoney(p.price, p.currency, lang)}
                      {p.price_mode === 'rules' && <span className="muted small"> · {t.adminProducts.byRules}</span>}
                    </td>
                    <td>
                      <AvailabilityBadge availability={p.availability} leadTimeDays={p.lead_time_days} />
                    </td>
                    <td>{p.active ? t.adminCommon.yes : t.adminCommon.no}</td>
                    <td>
                      <Link to={`/admin/products/${p.id}`} className="btn btn-outline btn-sm">
                        {t.adminCommon.edit}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={ADMIN_LIST_SIZE} total={products.data.total} onChange={setPage} />
        </>
      )}
    </>
  )
}
