import { useSearchParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Pagination } from '../../components/Pagination'
import { Spinner } from '../../components/Spinner'
import { PartsAssistant } from '../../components/shop/PartsAssistant'
import { ProductCard } from '../../components/shop/ProductCard'
import { ProductFilters, type FiltersValue } from '../../components/shop/ProductFilters'
import { ProductSearch } from '../../components/shop/ProductSearch'
import type { VehicleValue } from '../../components/shop/vehicle'
import { VehicleSelector } from '../../components/shop/VehicleSelector'
import { useAsync } from '../../hooks/useAsync'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import { catalogProvider } from '../../services/catalog'
import { getErrorMessage } from '../../services/errors'
import type { PartCondition } from '../../types'
import { cardFromItem } from '../../utils/catalog'

const PAGE_SIZE = 12

/** /pecas — catalogue search (state lives in the URL so results can be shared). */
export function ShopPage() {
  const { t, lang } = useI18n()
  const [params, setParams] = useSearchParams()

  const query = params.get('q') ?? ''
  const vehicle: VehicleValue = {
    makeId: params.get('make') ?? '',
    modelId: params.get('model') ?? '',
    variantId: params.get('variant') ?? '',
    year: params.get('year') ?? '',
  }
  const condition = params.get('condition')
  const filters: FiltersValue = {
    categoryId: params.get('category') ?? '',
    condition: condition === 'new' || condition === 'used' ? (condition as PartCondition) : '',
  }
  const page = Math.max(Number(params.get('page') ?? 0) || 0, 0)

  const categories = useAsync(() => catalogProvider.listCategories(), [])
  const results = useAsync(
    () =>
      catalogProvider.searchProducts({
        query,
        makeId: vehicle.makeId || undefined,
        modelId: vehicle.modelId || undefined,
        variantId: vehicle.variantId || undefined,
        year: vehicle.year ? Number(vehicle.year) : undefined,
        categoryId: filters.categoryId || undefined,
        condition: filters.condition || undefined,
        // A single token with digits may be a part / OE reference.
        reference: /^[\w.-]*\d[\w.-]*$/.test(query) && query.length >= 4 ? query : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    [
      query,
      vehicle.makeId,
      vehicle.modelId,
      vehicle.variantId,
      vehicle.year,
      filters.categoryId,
      filters.condition,
      page,
    ],
  )

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value)
      else merged.delete(key)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged)
  }

  const data = results.data

  return (
    <div className="container page shop-page">
      <header className="shop-header">
        <p className="eyebrow-pill">{t.shop.eyebrow}</p>
        <h1>{t.shop.title}</h1>
        <p className="muted">{t.shop.subtitle}</p>
        <ProductSearch key={query} initialQuery={query} onSearch={(q) => update({ q })} />
      </header>

      <div className="shop-layout">
        <aside className="shop-filters card" aria-label={t.shop.filters}>
          <h2 className="card-title">{t.shop.vehicle}</h2>
          <VehicleSelector
            value={vehicle}
            onChange={(v) => update({ make: v.makeId, model: v.modelId, variant: v.variantId, year: v.year })}
          />
          <h2 className="card-title">{t.shop.filters}</h2>
          <ProductFilters
            categories={categories.data ?? []}
            value={filters}
            onChange={(f) => update({ category: f.categoryId, condition: f.condition })}
          />
          {params.toString() && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setParams(new URLSearchParams())}>
              {t.shop.clearFilters}
            </button>
          )}
        </aside>

        <section className="shop-results" aria-labelledby="results-title" aria-busy={results.loading}>
          <h2 id="results-title" className="sr-only">
            {t.shop.results}
          </h2>
          {results.error !== undefined && <Alert tone="error">{getErrorMessage(results.error, t)}</Alert>}
          {results.loading && !data && <Spinner />}
          {data && (
            <>
              <p className="muted results-count">
                {interpolate(t.shop.resultsCount, {
                  count: data.total_capped ? `${data.total}+` : String(data.total),
                })}
              </p>
              {data.items.length === 0 ? (
                <div className="card empty">
                  <p>{t.shop.noResults}</p>
                </div>
              ) : (
                <div className="product-grid">
                  {data.items.map((item) => (
                    <ProductCard key={item.id} product={cardFromItem(item, lang)} />
                  ))}
                </div>
              )}
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={data.total}
                onChange={(p) => update({ page: String(p) })}
              />
            </>
          )}
        </section>

        <div className="shop-assistant">
          <PartsAssistant />
        </div>
      </div>
    </div>
  )
}
