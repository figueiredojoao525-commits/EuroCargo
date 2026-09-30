import { Alert } from '../../components/Alert'
import { CrudManager, type CrudField } from '../../components/admin/CrudManager'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import {
  deleteCategory,
  deleteMake,
  deleteModel,
  deleteVariant,
  listCategoriesAdmin,
  listMakesAdmin,
  listModelsAdmin,
  listVariantsAdmin,
  saveCategory,
  saveMake,
  saveModel,
  saveVariant,
} from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import type { PartCategory, VehicleMake, VehicleModel, VehicleVariant } from '../../types'
import { formatYears, withSlug } from '../../utils/catalog'

const ICONS = ['bulb', 'brake', 'engine', 'suspension', 'filter', 'car', 'bolt', 'cooling']
const FUELS = ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other'] as const

/** /admin/catalog — categories and the vehicle tree (make → model → variant). */
export function AdminCatalogPage() {
  const { t } = useI18n()
  const categories = useAsync(listCategoriesAdmin, [])
  const makes = useAsync(listMakesAdmin, [])
  const models = useAsync(listModelsAdmin, [])
  const variants = useAsync(listVariantsAdmin, [])

  const error = categories.error ?? makes.error ?? models.error ?? variants.error
  const makeName = (id: string) => makes.data?.find((m) => m.id === id)?.name ?? ''
  const modelOptions = (models.data ?? []).map((m) => ({ value: m.id, label: `${makeName(m.make_id)} ${m.name}` }))
  const years = { hint: t.adminCatalog.yearHint, maxLength: 4 }

  const categoryFields: CrudField<PartCategory>[] = [
    { key: 'name', label: t.adminCommon.namePt, required: true, maxLength: 80, column: true },
    { key: 'name_i18n', label: t.adminCommon.translations, type: 'i18n', maxLength: 80 },
    { key: 'slug', label: t.adminCommon.slug, hint: t.adminCommon.slugHint, maxLength: 80, column: true },
    {
      key: 'parent_id',
      label: t.adminCatalog.parent,
      type: 'select',
      options: (categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
      column: true,
    },
    { key: 'icon', label: t.adminCatalog.icon, type: 'select', options: ICONS.map((i) => ({ value: i, label: i })) },
    { key: 'position', label: t.adminCatalog.position, type: 'number', initial: '0', column: true },
    { key: 'active', label: t.adminCommon.active, type: 'checkbox', initial: true, column: true },
  ]
  const makeFields: CrudField<VehicleMake>[] = [
    { key: 'name', label: t.adminCommon.name, required: true, maxLength: 60, column: true },
    { key: 'slug', label: t.adminCommon.slug, hint: t.adminCommon.slugHint, maxLength: 60, column: true },
    { key: 'active', label: t.adminCommon.active, type: 'checkbox', initial: true, column: true },
  ]
  const modelFields: CrudField<VehicleModel>[] = [
    {
      key: 'make_id',
      label: t.vehicles.make,
      type: 'select',
      required: true,
      column: true,
      options: (makes.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    },
    { key: 'name', label: t.adminCommon.name, required: true, maxLength: 80, column: true },
    { key: 'slug', label: t.adminCommon.slug, hint: t.adminCommon.slugHint, maxLength: 80 },
    { key: 'body_type', label: t.adminCatalog.bodyType, maxLength: 40 },
    {
      key: 'year_from',
      label: t.adminCatalog.yearFrom,
      type: 'number',
      ...years,
      column: true,
      render: (m) => formatYears(m.year_from, m.year_to) || t.common.none,
    },
    { key: 'year_to', label: t.adminCatalog.yearTo, type: 'number', ...years },
    { key: 'active', label: t.adminCommon.active, type: 'checkbox', initial: true, column: true },
  ]
  const variantFields: CrudField<VehicleVariant>[] = [
    { key: 'model_id', label: t.vehicles.model, type: 'select', required: true, options: modelOptions, column: true },
    { key: 'name', label: t.adminCatalog.variant, required: true, maxLength: 120, column: true },
    { key: 'engine_code', label: t.adminCatalog.engineCode, maxLength: 40, column: true },
    {
      key: 'fuel',
      label: t.adminCatalog.fuel,
      type: 'select',
      options: FUELS.map((f) => ({ value: f, label: t.fuel[f] })),
    },
    { key: 'power_kw', label: t.adminCatalog.powerKw, type: 'number' },
    { key: 'engine_cc', label: t.adminCatalog.engineCc, type: 'number' },
    {
      key: 'year_from',
      label: t.adminCatalog.yearFrom,
      type: 'number',
      ...years,
      column: true,
      render: (v) => formatYears(v.year_from, v.year_to) || t.common.none,
    },
    { key: 'year_to', label: t.adminCatalog.yearTo, type: 'number', ...years },
  ]

  if (!categories.data || !makes.data || !models.data || !variants.data) {
    return error !== undefined ? <Alert tone="error">{getErrorMessage(error, t)}</Alert> : <Spinner />
  }

  return (
    <>
      <h1>{t.adminNav.catalog}</h1>
      <p className="muted">{t.adminCatalog.intro}</p>
      <div className="stack">
        <CrudManager
          title={t.adminCatalog.categories}
          rows={categories.data}
          fields={categoryFields}
          onSave={(row, id) => saveCategory(withSlug(row), id)}
          onDelete={deleteCategory}
          onChanged={categories.reload}
        />
        <CrudManager
          title={t.adminCatalog.makes}
          rows={makes.data}
          fields={makeFields}
          onSave={(row, id) => saveMake(withSlug(row), id)}
          onDelete={deleteMake}
          onChanged={makes.reload}
        />
        <CrudManager
          title={t.adminCatalog.models}
          rows={models.data}
          fields={modelFields}
          onSave={(row, id) => saveModel(withSlug(row), id)}
          onDelete={deleteModel}
          onChanged={models.reload}
        />
        <CrudManager
          title={t.adminCatalog.variants}
          rows={variants.data}
          fields={variantFields}
          onSave={saveVariant}
          onDelete={deleteVariant}
          onChanged={variants.reload}
        />
      </div>
    </>
  )
}
