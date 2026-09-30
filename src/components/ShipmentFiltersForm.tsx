import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n/context'
import { EMPTY_FILTERS, type ShipmentFilters } from '../services/admin'
import { SHIPMENT_STATUSES, type ShipmentStatus } from '../types'
import { CountrySelect } from './CountrySelect'
import { Field } from './Field'

interface Props {
  initial: ShipmentFilters
  onApply: (filters: ShipmentFilters) => void
}

export function ShipmentFiltersForm({ initial, onApply }: Props) {
  const { t } = useI18n()
  const [values, setValues] = useState<ShipmentFilters>(initial)
  const set = <K extends keyof ShipmentFilters>(key: K, value: ShipmentFilters[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onApply(values)
  }

  function handleClear() {
    setValues(EMPTY_FILTERS)
    onApply(EMPTY_FILTERS)
  }

  return (
    <form className="card filters" onSubmit={handleSubmit} aria-label={t.admin.filters.title}>
      <Field label={t.admin.filters.code} htmlFor="f-code">
        <input id="f-code" value={values.code} onChange={(e) => set('code', e.target.value)} maxLength={24} />
      </Field>
      <Field label={t.admin.filters.status} htmlFor="f-status">
        <select id="f-status" value={values.status} onChange={(e) => set('status', e.target.value as ShipmentStatus | '')}>
          <option value="">{t.admin.filters.all}</option>
          {SHIPMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t.status[status]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.admin.filters.origin} htmlFor="f-origin">
        <CountrySelect
          id="f-origin"
          value={values.origin}
          placeholder={t.admin.filters.all}
          onChange={(e) => set('origin', e.target.value)}
        />
      </Field>
      <Field label={t.admin.filters.destination} htmlFor="f-destination">
        <CountrySelect
          id="f-destination"
          value={values.destination}
          placeholder={t.admin.filters.all}
          onChange={(e) => set('destination', e.target.value)}
        />
      </Field>
      <Field label={t.admin.filters.dateFrom} htmlFor="f-from">
        <input id="f-from" type="date" value={values.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
      </Field>
      <Field label={t.admin.filters.dateTo} htmlFor="f-to">
        <input id="f-to" type="date" value={values.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
      </Field>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {t.admin.filters.apply}
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleClear}>
          {t.admin.filters.clear}
        </button>
      </div>
    </form>
  )
}
