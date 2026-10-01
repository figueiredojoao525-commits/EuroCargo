import { Link, useSearchParams } from 'react-router-dom'
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
import { smartSearch } from '../../services/ai/understand'
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
  // ?raw=1 searches the text as typed (no interpretation of vehicle / year / engine).
  const raw = params.get('raw') === '1'

  const categories = useAsync(() => catalogProvider.listCategories(), [])
  const results = useAsync(
    () =>
      smartSearch(
        query,
        {
          makeId: vehicle.makeId || undefined,
          modelId: vehicle.modelId || undefined,
          variantId: vehicle.variantId || undefined,
          year: vehicle.year ? Number(vehicle.year) : undefined,
          categoryId: filters.categoryId || undefined,
          condition: filters.condition || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
        // Explicit vehicle filters already say what the text would: search the text as typed.
        !raw && !vehicle.makeId,
      ),
    [
      query,
      raw,
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

  const data = results.data?.result
  const parsed = results.data?.parsed
  const relaxed = results.data?.relaxed ?? false
  const exactTotal = data?.exact_total
  const hasText = Boolean(query.trim())
  // Approximate results: the database says how each item matched (20261005); before that, every result counts.
  const approximate = hasText && data !== undefined && exactTotal !== undefined && (relaxed || exactTotal === 0) && data.total > 0
  const firstPartial = data?.items.findIndex((i) => i.match === 'partial') ?? -1
  const understood = parsed
    ? [
        parsed.text && `«${parsed.text}»`,
        [parsed.make?.name, parsed.model?.name].filter(Boolean).join(' '),
        parsed.year,
        [parsed.engineCc && (parsed.engineCc / 1000).toFixed(1), parsed.engine?.toUpperCase()].filter(Boolean).join(' '),
        parsed.fuel && t.fuel[parsed.fuel],
        parsed.condition && t.condition[parsed.condition],
        parsed.reference && `${t.shop.ref} ${parsed.reference}`,
        parsed.oe && `${t.shop.oe} ${parsed.oe}`,
      ].filter(Boolean)
    : []
  // "Ask EuroCargo for this part": a free-text request prefilled with the search.
  const vehicleText = parsed ? [parsed.make?.name, parsed.model?.name, parsed.year].filter(Boolean).join(' ') : ''
  const requestLink = `/carrinho?${new URLSearchParams({
    message: interpolate(t.shop.requestPartMessage, { query: query.trim() }),
    ...(vehicleText ? { vehicle: vehicleText } : {}),
  }).toString()}`

  return (
    <div className="container page shop-page">
      <header className="shop-header">
        <p className="eyebrow-pill">{t.shop.eyebrow}</p>
        <h1>{t.shop.title}</h1>
        <p className="muted">{t.shop.subtitle}</p>
        <ProductSearch key={query} initialQuery={query} onSearch={(q) => update({ q, raw: '' })} />
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
              {understood.length > 0 && (
                <p className="search-understood small">
                  <strong>{t.shop.interpreted}</strong> {understood.join(' · ')}{' '}
                  <button type="button" className="btn-link" onClick={() => update({ raw: '1' })}>
                    {t.shop.searchTextOnly}
                  </button>
                </p>
              )}
              <p className="muted results-count">
                {interpolate(t.shop.resultsCount, {
                  count: data.total_capped ? `${data.total}+` : String(data.total),
                })}
                {hasText && exactTotal !== undefined && exactTotal > 0 && exactTotal < data.total && (
                  <> · {interpolate(t.shop.exactCount, { count: String(exactTotal) })}</>
                )}
              </p>
              {approximate && (
                <Alert tone="warning">
                  {t.shop.noExact}{' '}
                  <Link to={requestLink}>{t.shop.requestPart}</Link>
                </Alert>
              )}
              {data.items.length === 0 ? (
                <div className="card empty stack">
                  <p>{t.shop.noResults}</p>
                  {hasText && (
                    <>
                      <p className="muted small">{t.shop.requestPartHint}</p>
                      <div className="inline-actions">
                        <Link to={requestLink} className="btn btn-accent">
                          {t.shop.requestPart}
                        </Link>
                        <a href="#assistant-input" className="btn btn-outline">
                          {t.shop.askAssistant}
                        </a>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="product-grid">
                  {data.items.map((item, index) => (
                    <div key={item.id} className="contents">
                      {index === firstPartial && firstPartial > 0 && (
                        <p className="results-divider muted small">{t.shop.approxHeading}</p>
                      )}
                      <ProductCard product={cardFromItem(item, lang)} />
                    </div>
                  ))}
                </div>
              )}
              {data.items.length > 0 && hasText && (
                <p className="muted small mt">
                  {t.shop.requestPartHint} <Link to={requestLink}>{t.shop.requestPart}</Link>
                </p>
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
