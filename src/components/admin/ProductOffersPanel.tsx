import { useAsync } from '../../hooks/useAsync'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import { getProductOffers } from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import { formatDateTime, formatMoney } from '../../utils/format'
import { Alert } from '../Alert'
import { AvailabilityBadge, DemoBadge } from '../shop/Badges'
import { Spinner } from '../Spinner'

/**
 * Admin only: every internal supplier offer of a product, the one the system chose, the margin
 * rule and the EuroCargo price — next to what the customer actually sees.
 */
export function ProductOffersPanel({ productId, version }: { productId: string; version: unknown }) {
  const { t, lang } = useI18n()
  const o = t.adminOffers
  const offers = useAsync(() => getProductOffers(productId), [productId, version])
  const money = (value: number | null, currency: string) => (value === null ? '—' : formatMoney(value, currency, lang))

  return (
    <section className="card">
      <h2 className="card-title">{o.title}</h2>
      <p className="muted small">{o.hint}</p>
      {offers.error !== undefined && <Alert tone="error">{getErrorMessage(offers.error, t)}</Alert>}
      {offers.loading && !offers.data && <Spinner />}
      {offers.data === null && <Alert tone="warning">{o.migrationMissing}</Alert>}
      {offers.data && (
        <>
          <div className="offer-summary">
            <span className="muted small">{o.aggregated}:</span>
            <strong>
              {offers.data.price === null ? t.shop.priceOnRequest : money(offers.data.price, offers.data.currency)}
            </strong>
            <AvailabilityBadge availability={offers.data.availability} leadTimeDays={offers.data.lead_time_days} />
            <span className="muted small">
              {o.strategy}: {o.strategies[offers.data.strategy]}
            </span>
          </div>
          {offers.data.offers.length === 0 ? (
            <p className="muted">{o.none}</p>
          ) : (
            <div className="table-wrap mt">
              <table>
                <thead>
                  <tr>
                    <th>{o.supplier}</th>
                    <th>{o.cost}</th>
                    <th>{o.stock}</th>
                    <th>{o.lead}</th>
                    <th>{o.availability}</th>
                    <th>{o.rule}</th>
                    <th>{o.price}</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.data.offers.map((offer) => (
                    <tr key={offer.id} className={offer.selected ? 'offer-selected' : undefined}>
                      <td>
                        {offer.selected && <span className="badge badge-delivered">{o.selected}</span>}{' '}
                        {offer.supplier_name} {offer.supplier_is_demo && <DemoBadge />}
                        {(!offer.active || !offer.supplier_active) && <span className="muted small"> · {o.inactive}</span>}
                        {offer.supplier_sku && <div className="mono small muted">{offer.supplier_sku}</div>}
                        {offer.last_synced_at && (
                          <div className="small muted">{formatDateTime(offer.last_synced_at, lang)}</div>
                        )}
                      </td>
                      <td className="nowrap">{money(offer.cost_price, offer.currency)}</td>
                      <td>{offer.stock_quantity ?? '—'}</td>
                      <td>{offer.lead_time_days === null ? '—' : interpolate(o.days, { days: String(offer.lead_time_days) })}</td>
                      <td>
                        <AvailabilityBadge availability={offer.availability} />
                      </td>
                      <td className="small">
                        {offer.rule_name ?? '—'}
                        {offer.margin_percent !== null && (
                          <div className="muted">
                            {offer.margin_percent} %{offer.fixed_amount ? ` + ${money(offer.fixed_amount, offer.currency)}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="nowrap">
                        <strong>{money(offer.price, offer.currency)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
