import { useMemo } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { catalogProvider } from '../../services/catalog'
import type { VehicleVariant } from '../../types'
import { formatYears } from '../../utils/catalog'
import { Field } from '../Field'
import type { VehicleValue } from './vehicle'

const CURRENT_YEAR = new Date().getFullYear()

/** "1.6 HDi 110 · 80 kW · 9HZ · 2004–2008" */
function variantLabel(v: VehicleVariant): string {
  return [v.name, v.power_kw && `${v.power_kw} kW`, v.engine_code, formatYears(v.year_from, v.year_to)]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Make → model → engine (when the catalogue has engine versions) → year.
 * Years are limited to the model's / engine's production range when known.
 */
export function VehicleSelector({
  value,
  onChange,
  idPrefix = 'vehicle',
}: {
  value: VehicleValue
  onChange: (next: VehicleValue) => void
  idPrefix?: string
}) {
  const { t } = useI18n()
  const makes = useAsync(() => catalogProvider.listMakes(), [])
  const models = useAsync(
    () => (value.makeId ? catalogProvider.listModels(value.makeId) : Promise.resolve([])),
    [value.makeId],
  )

  const variants = useAsync(
    () => (value.modelId ? catalogProvider.listVariants(value.modelId) : Promise.resolve([])),
    [value.modelId],
  )

  const model = models.data?.find((m) => m.id === value.modelId)
  const variant = variants.data?.find((v) => v.id === value.variantId)
  const years = useMemo(() => {
    const from = variant?.year_from ?? model?.year_from ?? 1980
    const to = Math.min(variant?.year_to ?? model?.year_to ?? CURRENT_YEAR, CURRENT_YEAR)
    return Array.from({ length: Math.max(to - from + 1, 0) }, (_, i) => to - i)
  }, [model, variant])

  return (
    <div className="vehicle-selector">
      <Field label={t.vehicles.make} htmlFor={`${idPrefix}-make`}>
        <select
          id={`${idPrefix}-make`}
          value={value.makeId}
          onChange={(e) => onChange({ makeId: e.target.value, modelId: '', variantId: '', year: '' })}
        >
          <option value="">{t.vehicles.anyMake}</option>
          {makes.data?.map((make) => (
            <option key={make.id} value={make.id}>
              {make.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.vehicles.model} htmlFor={`${idPrefix}-model`}>
        <select
          id={`${idPrefix}-model`}
          value={value.modelId}
          disabled={!value.makeId}
          onChange={(e) => onChange({ ...value, modelId: e.target.value, variantId: '', year: '' })}
        >
          <option value="">{t.vehicles.anyModel}</option>
          {models.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      {variants.data && variants.data.length > 0 && (
        <Field label={t.vehicles.engine} htmlFor={`${idPrefix}-variant`}>
          <select
            id={`${idPrefix}-variant`}
            value={value.variantId}
            onChange={(e) => onChange({ ...value, variantId: e.target.value, year: '' })}
          >
            <option value="">{t.vehicles.anyEngine}</option>
            {variants.data.map((v) => (
              <option key={v.id} value={v.id}>
                {variantLabel(v)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={t.vehicles.year} htmlFor={`${idPrefix}-year`}>
        <select
          id={`${idPrefix}-year`}
          value={value.year}
          disabled={!value.makeId}
          onChange={(e) => onChange({ ...value, year: e.target.value })}
        >
          <option value="">{t.vehicles.anyYear}</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}
