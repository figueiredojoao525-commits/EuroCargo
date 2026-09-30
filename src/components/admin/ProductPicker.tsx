import { useState } from 'react'
import { useI18n } from '../../i18n/context'
import { catalogProvider } from '../../services/catalog'
import { getErrorMessage } from '../../services/errors'
import type { CatalogItem } from '../../types'
import { localized } from '../../utils/catalog'
import { formatMoney } from '../../utils/format'
import { Alert } from '../Alert'
import { ConditionBadge, DemoBadge } from '../shop/Badges'

/**
 * Searches the catalogue and hands back the chosen product.
 * Not a <form>: it is used inside the order form, and nested forms are invalid
 * (the inner submit would also submit the order).
 */
export function ProductPicker({ onPick }: { onPick: (item: CatalogItem) => void }) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CatalogItem[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function search() {
    if (!query.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await catalogProvider.search({ query, reference: query, limit: 10 })
      setItems(result.items)
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="product-picker">
      <div className="input-row" role="search">
        <label htmlFor="picker" className="sr-only">
          {t.adminOrders.findProduct}
        </label>
        <input
          id="picker"
          type="search"
          placeholder={t.adminOrders.findProduct}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              search()
            }
          }}
        />
        <button type="button" className="btn btn-outline" disabled={busy} onClick={search}>
          {t.shop.searchButton}
        </button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {items && items.length === 0 && <p className="muted small">{t.shop.noResults}</p>}
      {items && items.length > 0 && (
        <ul className="picker-results">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)}>
                <span>
                  {localized(item.name, item.name_i18n, lang)} <ConditionBadge condition={item.condition} />{' '}
                  {item.is_demo && <DemoBadge />}
                  <small className="muted mono"> {item.part_number}</small>
                </span>
                <span className="nowrap">
                  {item.price === null ? t.shop.priceOnRequest : formatMoney(item.price, item.currency, lang)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
