import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import type { Availability, PartCondition } from '../../types'
import { formatMoney } from '../../utils/format'

export function ConditionBadge({ condition }: { condition: PartCondition }) {
  const { t } = useI18n()
  return <span className={`badge badge-cond-${condition}`}>{t.condition[condition]}</span>
}

export function AvailabilityBadge({
  availability,
  leadTimeDays,
}: {
  availability: Availability
  leadTimeDays?: number | null
}) {
  const { t } = useI18n()
  const label =
    availability === 'on_order' && leadTimeDays
      ? interpolate(t.availability.onOrderDays, { days: String(leadTimeDays) })
      : t.availability[availability]
  return <span className={`badge badge-avail-${availability}`}>{label}</span>
}

/** Marks demonstration records so they are never mistaken for real offers. */
export function DemoBadge() {
  const { t } = useI18n()
  return (
    <span className="badge badge-demo" title={t.shop.demoHint}>
      {t.shop.demo}
    </span>
  )
}

/** Public price only (never costs). null → "price on request". */
export function PriceDisplay({
  price,
  currency,
  isDemo = false,
  size = 'md',
}: {
  price: number | null
  currency: string
  isDemo?: boolean
  size?: 'md' | 'lg'
}) {
  const { t, lang } = useI18n()
  return (
    <div className={`price price-${size}`}>
      {price === null ? (
        <span className="price-request">{t.shop.priceOnRequest}</span>
      ) : (
        <span className="price-value">{formatMoney(price, currency, lang)}</span>
      )}
      {isDemo && price !== null && <span className="price-note">{t.shop.demoPrice}</span>}
    </div>
  )
}
