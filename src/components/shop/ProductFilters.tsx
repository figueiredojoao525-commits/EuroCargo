import { useI18n } from '../../i18n/context'
import type { PartCategory, PartCondition } from '../../types'
import { localized } from '../../utils/catalog'
import { Field } from '../Field'

export interface FiltersValue {
  categoryId: string
  condition: '' | PartCondition
}

export function ProductFilters({
  categories,
  value,
  onChange,
}: {
  categories: PartCategory[]
  value: FiltersValue
  onChange: (next: FiltersValue) => void
}) {
  const { t, lang } = useI18n()
  const conditions: { value: FiltersValue['condition']; label: string }[] = [
    { value: '', label: t.shop.allConditions },
    { value: 'new', label: t.condition.new },
    { value: 'used', label: t.condition.used },
  ]

  return (
    <div className="product-filters">
      <Field label={t.shop.category} htmlFor="filter-category">
        <select
          id="filter-category"
          value={value.categoryId}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
        >
          <option value="">{t.shop.allCategories}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {localized(category.name, category.name_i18n, lang)}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="segmented">
        <legend>{t.shop.condition}</legend>
        <div className="segmented-options">
          {conditions.map((option) => (
            <label key={option.value || 'all'} className={value.condition === option.value ? 'active' : ''}>
              <input
                type="radio"
                name="condition"
                value={option.value}
                checked={value.condition === option.value}
                onChange={() => onChange({ ...value, condition: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
