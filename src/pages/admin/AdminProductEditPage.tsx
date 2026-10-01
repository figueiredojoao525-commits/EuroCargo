import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { CrudManager, type CrudField } from '../../components/admin/CrudManager'
import { ProductOffersPanel } from '../../components/admin/ProductOffersPanel'
import { Field } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { LANGUAGES, LANGUAGE_META } from '../../i18n'
import { useI18n } from '../../i18n/context'
import {
  deleteCompatibility,
  deleteImage,
  deleteProduct,
  deleteSupplierProduct,
  getProductForAdmin,
  listBrands,
  listCategoriesAdmin,
  listMakesAdmin,
  listModelsAdmin,
  listSuppliers,
  listVariantsAdmin,
  recalculatePrice,
  saveCompatibility,
  saveImage,
  setPrimaryImage,
  withoutEmpty,
  saveProduct,
  saveSupplierProduct,
  uploadProductImage,
} from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import {
  AVAILABILITIES,
  type CompatibilityWithNames,
  type PriceCalculation,
  type Product,
  type ProductImage,
  type SupplierProduct,
} from '../../types'
import { formatYears } from '../../utils/catalog'
import { formatDateTime, formatMoney } from '../../utils/format'

const TRANSLATED = LANGUAGES.filter((l) => l !== 'pt')

type Draft = Record<string, string | boolean>

function toDraft(p?: Product): Draft {
  const d: Draft = {
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    brand_id: p?.brand_id ?? '',
    category_id: p?.category_id ?? '',
    manufacturer: p?.manufacturer ?? '',
    part_number: p?.part_number ?? '',
    oe_numbers: p?.oe_numbers.join(', ') ?? '',
    group_key: p?.group_key ?? '',
    condition: p?.condition ?? 'new',
    price: p?.price === null || p?.price === undefined ? '' : String(p.price),
    currency: p?.currency ?? 'EUR',
    price_mode: p?.price_mode ?? 'manual',
    availability: p?.availability ?? 'on_request',
    stock_quantity: p?.stock_quantity === null || p?.stock_quantity === undefined ? '' : String(p.stock_quantity),
    lead_time_days: p?.lead_time_days === null || p?.lead_time_days === undefined ? '' : String(p.lead_time_days),
    description: p?.description ?? '',
    specs: Object.entries(p?.specs ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
    data_source: p?.data_source ?? 'manual',
    active: p?.active ?? true,
    is_demo: p?.is_demo ?? false,
  }
  for (const lang of TRANSLATED) d[`name_${lang}`] = p?.name_i18n?.[lang] ?? ''
  return d
}

const num = (v: string | boolean) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')))
const text = (v: string | boolean) => String(v).trim() || null

function fromDraft(d: Draft): Record<string, unknown> {
  const specs: Record<string, string> = {}
  for (const line of String(d.specs).split('\n')) {
    const i = line.indexOf(':')
    if (i > 0 && line.slice(i + 1).trim()) specs[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  const nameI18n: Record<string, string> = {}
  for (const lang of TRANSLATED) if (String(d[`name_${lang}`]).trim()) nameI18n[lang] = String(d[`name_${lang}`]).trim()
  return {
    name: String(d.name).trim(),
    name_i18n: nameI18n,
    sku: text(d.sku),
    brand_id: text(d.brand_id),
    category_id: text(d.category_id),
    manufacturer: text(d.manufacturer),
    part_number: text(d.part_number),
    oe_numbers: String(d.oe_numbers)
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean),
    group_key: text(d.group_key),
    condition: d.condition,
    price: num(d.price),
    currency: String(d.currency).trim().toUpperCase() || 'EUR',
    price_mode: d.price_mode,
    availability: d.availability,
    stock_quantity: num(d.stock_quantity),
    lead_time_days: num(d.lead_time_days),
    description: text(d.description),
    specs,
    data_source: text(d.data_source) ?? 'manual',
    active: Boolean(d.active),
    is_demo: Boolean(d.is_demo),
  }
}

/** /admin/products/new and /admin/products/:id */
export function AdminProductEditPage() {
  const { t, lang } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id
  const bundle = useAsync(() => (id ? getProductForAdmin(id) : Promise.resolve(null)), [id])
  const brands = useAsync(listBrands, [])
  const categories = useAsync(listCategoriesAdmin, [])

  if (!isNew && bundle.loading && !bundle.data) return <Spinner />
  if (!isNew && (bundle.error !== undefined || !bundle.data)) {
    return (
      <Alert tone="error">
        {bundle.error !== undefined ? getErrorMessage(bundle.error, t) : t.errors.productNotFound}
      </Alert>
    )
  }

  return (
    <>
      <Link to="/admin/products" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.common.back}
      </Link>
      <div className="page-header">
        <h1>{isNew ? t.adminProducts.new : bundle.data!.product.name}</h1>
        {!isNew && (
          <Link to={`/pecas/${id}`} className="btn btn-ghost btn-sm" target="_blank">
            <Icon name="external" size={16} />
            {t.adminProducts.viewInShop}
          </Link>
        )}
      </div>

      <ProductForm
        key={bundle.data?.product.id ?? 'new'}
        product={bundle.data?.product}
        brands={brands.data ?? []}
        categories={categories.data ?? []}
        onSaved={(saved) => (isNew ? navigate(`/admin/products/${saved.id}`, { replace: true }) : bundle.reload())}
        onDeleted={() => navigate('/admin/products', { replace: true })}
      />

      {!isNew && bundle.data && (
        <div className="stack mt">
          <ImagesSection productId={id!} images={bundle.data.images} onChanged={bundle.reload} />
          <CompatibilitySection productId={id!} rows={bundle.data.compatibility} onChanged={bundle.reload} />
          <ProductOffersPanel productId={id!} version={bundle.data} />
          <SuppliersSection productId={id!} rows={bundle.data.supplierProducts} onChanged={bundle.reload} />
          <PricingSection productId={id!} onApplied={bundle.reload} />
          <section className="card">
            <h2 className="card-title">{t.adminProducts.history}</h2>
            {bundle.data.history.length === 0 ? (
              <p className="muted">{t.adminCommon.empty}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.dashboard.date}</th>
                      <th>{t.adminProducts.oldPrice}</th>
                      <th>{t.adminProducts.newPrice}</th>
                      <th>{t.adminPricing.cost}</th>
                      <th>{t.adminProducts.reason}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.data.history.map((h) => (
                      <tr key={h.id}>
                        <td className="nowrap">{formatDateTime(h.created_at, lang)}</td>
                        <td>{h.old_price === null ? t.common.none : formatMoney(h.old_price, 'EUR', lang)}</td>
                        <td>{h.new_price === null ? t.common.none : formatMoney(h.new_price, 'EUR', lang)}</td>
                        <td>{h.cost_price === null ? t.common.none : formatMoney(h.cost_price, 'EUR', lang)}</td>
                        <td>{h.reason === 'rule' ? t.adminProducts.byRules : t.adminProducts.manual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

function ProductForm({
  product,
  brands,
  categories,
  onSaved,
  onDeleted,
}: {
  product?: Product
  brands: { id: string; name: string }[]
  categories: { id: string; name: string }[]
  onSaved: (p: Product) => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Draft>(() => toDraft(product))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (key: string, value: string | boolean) => setDraft((d) => ({ ...d, [key]: value }))
  const input = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} htmlFor={`p-${key}`}>
      <input id={`p-${key}`} value={String(draft[key])} onChange={(e) => set(key, e.target.value)} {...props} />
    </Field>
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (String(draft.name).trim().length < 2) {
      setError(`${t.adminCommon.name}: ${t.common.required}`)
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await saveProduct(fromDraft(draft), product?.id)
      setSaved(true)
      onSaved(result)
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!product) return
    try {
      await deleteProduct(product.id)
      onDeleted()
    } catch (err) {
      setError(getErrorMessage(err, t))
      setConfirmDelete(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">{t.adminCommon.saved}</Alert>}

      <fieldset className="card">
        <legend>{t.adminProducts.identity}</legend>
        <div className="form-grid">
          <div className="span-2">{input('name', `${t.adminCommon.namePt} *`, { maxLength: 200 })}</div>
          {TRANSLATED.map((l) => (
            <div key={l}>
              {input(`name_${l}`, `${t.adminCommon.name} (${LANGUAGE_META[l].name})`, { maxLength: 200, lang: l })}
            </div>
          ))}
          <Field label={t.shop.brand} htmlFor="p-brand">
            <select id="p-brand" value={String(draft.brand_id)} onChange={(e) => set('brand_id', e.target.value)}>
              <option value="">{t.common.none}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.shop.category} htmlFor="p-category">
            <select
              id="p-category"
              value={String(draft.category_id)}
              onChange={(e) => set('category_id', e.target.value)}
            >
              <option value="">{t.common.none}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {input('manufacturer', t.shop.manufacturer, { maxLength: 120 })}
          {input('sku', t.adminProducts.sku, { maxLength: 60 })}
          {input('part_number', t.shop.reference, { maxLength: 80 })}
          {input('oe_numbers', t.adminProducts.oeNumbers, { maxLength: 1000 })}
          {input('group_key', t.adminProducts.groupKey, { maxLength: 80 })}
          <Field label={t.shop.condition} htmlFor="p-condition">
            <select id="p-condition" value={String(draft.condition)} onChange={(e) => set('condition', e.target.value)}>
              <option value="new">{t.condition.new}</option>
              <option value="used">{t.condition.used}</option>
            </select>
          </Field>
        </div>
        <p className="muted small">{t.adminProducts.groupKeyHint}</p>
      </fieldset>

      <fieldset className="card">
        <legend>{t.adminProducts.priceStock}</legend>
        <div className="form-grid">
          {input('price', t.adminProducts.publicPrice, { inputMode: 'decimal' })}
          {input('currency', t.adminProducts.currency, { maxLength: 3 })}
          <Field label={t.adminProducts.priceMode} htmlFor="p-mode">
            <select id="p-mode" value={String(draft.price_mode)} onChange={(e) => set('price_mode', e.target.value)}>
              <option value="manual">{t.adminProducts.manual}</option>
              <option value="rules">{t.adminProducts.byRules}</option>
            </select>
          </Field>
          <Field label={t.adminProducts.availability} htmlFor="p-avail">
            <select
              id="p-avail"
              value={String(draft.availability)}
              onChange={(e) => set('availability', e.target.value)}
            >
              {AVAILABILITIES.map((a) => (
                <option key={a} value={a}>
                  {t.availability[a]}
                </option>
              ))}
            </select>
          </Field>
          {input('stock_quantity', t.shop.stock, { inputMode: 'numeric' })}
          {input('lead_time_days', t.adminProducts.leadTime, { inputMode: 'numeric' })}
        </div>
        <p className="muted small">{t.adminProducts.priceHint}</p>
      </fieldset>

      <fieldset className="card">
        <legend>{t.shop.details}</legend>
        <div className="form-grid">
          <div className="span-2">
            <Field label={t.adminProducts.description} htmlFor="p-desc">
              <textarea
                id="p-desc"
                maxLength={5000}
                value={String(draft.description)}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
          </div>
          <div className="span-2">
            <Field label={t.adminProducts.specs} htmlFor="p-specs" hint={t.adminProducts.specsHint}>
              <textarea
                id="p-specs"
                maxLength={3000}
                value={String(draft.specs)}
                onChange={(e) => set('specs', e.target.value)}
              />
            </Field>
          </div>
          {input('data_source', t.shop.dataSource, { maxLength: 60 })}
          <div className="stack">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Boolean(draft.active)}
                onChange={(e) => set('active', e.target.checked)}
              />
              {t.adminProducts.activeHint}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Boolean(draft.is_demo)}
                onChange={(e) => set('is_demo', e.target.checked)}
              />
              {t.adminProducts.demoHint}
            </label>
          </div>
        </div>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
          {saving ? t.common.loading : t.adminCommon.save}
        </button>
        {product &&
          (confirmDelete ? (
            <>
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                {t.adminCommon.confirmDelete}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                {t.common.cancel}
              </button>
              <span className="muted small">{t.adminProducts.deleteHint}</span>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} />
              {t.adminCommon.delete}
            </button>
          ))}
      </div>
    </form>
  )
}

function ImagesSection({
  productId,
  images,
  onChanged,
}: {
  productId: string
  images: ProductImage[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [license, setLicense] = useState('')
  // Columns added by migration 20261002 (only used once it is applied).
  const hasImageExtras = images.length === 0 || 'is_primary' in images[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add(imageUrl: string) {
    setBusy(true)
    setError('')
    try {
      await saveImage({
        product_id: productId,
        url: imageUrl,
        source: source.trim() || null,
        position: images.length,
        ...(license.trim() ? { license: license.trim() } : {}),
      })
      setUrl('')
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError(t.adminProducts.imageTooLarge)
      return
    }
    setBusy(true)
    setError('')
    try {
      await add(await uploadProductImage(productId, file))
    } catch (err) {
      setError(getErrorMessage(err, t))
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">{t.adminProducts.images}</h2>
      <p className="muted small">{t.adminProducts.imagesHint}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="admin-images">
        {images.map((image) => (
          <figure key={image.id}>
            <img src={image.url} alt={image.alt ?? ''} loading="lazy" />
            <figcaption>
              {image.is_primary && <span className="badge badge-delivered">{t.adminProducts.primaryImage}</span>}
              {(image.source || image.license) && (
                <span className="muted small">{[image.source, image.license].filter(Boolean).join(' · ')}</span>
              )}
              {hasImageExtras && !image.is_primary && 'is_primary' in image && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    await setPrimaryImage(productId, image.id).catch((e) => setError(getErrorMessage(e, t)))
                    onChanged()
                  }}
                >
                  {t.adminProducts.setPrimary}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={t.adminCommon.delete}
                onClick={async () => {
                  await deleteImage(image.id).catch((e) => setError(getErrorMessage(e, t)))
                  onChanged()
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="form-grid mt">
        <Field label={t.adminProducts.imageSource} htmlFor="img-source" hint={t.adminProducts.imageSourceHint}>
          <input id="img-source" maxLength={200} value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
        {hasImageExtras && (
          <Field label={t.adminProviders.imageLicense} htmlFor="img-license">
            <input id="img-license" maxLength={200} value={license} onChange={(e) => setLicense(e.target.value)} />
          </Field>
        )}
        <Field label={t.adminProducts.upload} htmlFor="img-file">
          <input
            id="img-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </Field>
        <div className="span-2">
          <Field label={t.adminProducts.imageUrl} htmlFor="img-url">
            <div className="input-row">
              <input
                id="img-url"
                type="url"
                placeholder="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy || !url.startsWith('https://')}
                onClick={() => add(url.trim())}
              >
                {t.adminCommon.add}
              </button>
            </div>
          </Field>
        </div>
      </div>
    </section>
  )
}

function CompatibilitySection({
  productId,
  rows,
  onChanged,
}: {
  productId: string
  rows: CompatibilityWithNames[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const makes = useAsync(listMakesAdmin, [])
  const models = useAsync(listModelsAdmin, [])
  const variants = useAsync(listVariantsAdmin, [])
  const makeName = (id: string) => makes.data?.find((m) => m.id === id)?.name ?? ''
  const modelName = (id: string) => models.data?.find((m) => m.id === id)?.name ?? ''

  const fields: CrudField<CompatibilityWithNames>[] = [
    {
      key: 'make_id',
      label: t.vehicles.make,
      type: 'select',
      required: true,
      column: true,
      options: (makes.data ?? []).map((m) => ({ value: m.id, label: m.name })),
      render: (r) => r.make?.name ?? '',
    },
    {
      key: 'model_id',
      label: t.vehicles.model,
      type: 'select',
      column: true,
      options: (models.data ?? []).map((m) => ({ value: m.id, label: `${makeName(m.make_id)} ${m.name}` })),
      render: (r) => r.model?.name ?? t.adminProducts.allModels,
    },
    {
      key: 'variant_id',
      label: t.adminCatalog.variant,
      type: 'select',
      options: (variants.data ?? []).map((v) => ({ value: v.id, label: `${modelName(v.model_id)} ${v.name}` })),
    },
    {
      key: 'year_from',
      label: t.adminCatalog.yearFrom,
      type: 'number',
      maxLength: 4,
      column: true,
      render: (r) => formatYears(r.year_from, r.year_to) || t.common.none,
    },
    { key: 'year_to', label: t.adminCatalog.yearTo, type: 'number', maxLength: 4 },
    {
      key: 'position',
      label: t.adminProducts.position,
      maxLength: 80,
      column: true,
      hint: t.adminProducts.positionHint,
    },
    { key: 'notes', label: t.adminCommon.notes, maxLength: 500 },
    { key: 'verified', label: t.shop.verified, type: 'checkbox', column: true },
  ]

  return (
    <section className="card">
      <CrudManager
        title={t.shop.compatibility}
        rows={rows}
        fields={fields}
        onSave={(row, id) => saveCompatibility({ ...row, product_id: productId, source: row.source ?? 'manual' }, id)}
        onDelete={deleteCompatibility}
        onChanged={onChanged}
        emptyText={t.shop.noCompatibility}
      />
    </section>
  )
}

function SuppliersSection({
  productId,
  rows,
  onChanged,
}: {
  productId: string
  rows: SupplierProduct[]
  onChanged: () => void
}) {
  const { t, lang } = useI18n()
  const suppliers = useAsync(listSuppliers, [])
  const fields: CrudField<SupplierProduct>[] = [
    {
      key: 'supplier_id',
      label: t.adminNav.suppliers,
      type: 'select',
      required: true,
      column: true,
      options: (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    },
    { key: 'supplier_sku', label: t.adminProducts.supplierSku, maxLength: 80, column: true },
    {
      key: 'cost_price',
      label: t.adminPricing.cost,
      type: 'number',
      column: true,
      render: (r) => (r.cost_price === null ? t.common.none : formatMoney(r.cost_price, r.currency, lang)),
    },
    { key: 'currency', label: t.adminProducts.currency, maxLength: 3, initial: 'EUR' },
    { key: 'stock_quantity', label: t.shop.stock, type: 'number', column: true },
    { key: 'lead_time_days', label: t.adminProducts.leadTime, type: 'number' },
    {
      key: 'condition',
      label: t.shop.condition,
      type: 'select',
      options: [
        { value: 'new', label: t.condition.new },
        { value: 'used', label: t.condition.used },
      ],
    },
    {
      key: 'availability',
      label: t.adminProducts.availability,
      type: 'select',
      required: true,
      initial: 'on_request',
      column: true,
      options: AVAILABILITIES.map((a) => ({ value: a, label: t.availability[a] })),
    },
    { key: 'source_url', label: t.adminImport.fields.supplier_url, type: 'url', maxLength: 500 },
    { key: 'active', label: t.adminCommon.active, type: 'checkbox', initial: true, column: true },
  ]
  return (
    <section className="card">
      <p className="muted small">{t.adminProducts.suppliersHint}</p>
      <CrudManager
        title={t.adminProducts.suppliers}
        rows={rows}
        fields={fields}
        onSave={(row, id) =>
          saveSupplierProduct(
            {
              ...withoutEmpty(row, 'source_url'),
              product_id: productId,
              currency: String(row.currency ?? 'EUR').toUpperCase(),
            },
            id,
          )
        }
        onDelete={deleteSupplierProduct}
        onChanged={onChanged}
      />
    </section>
  )
}

function PricingSection({ productId, onApplied }: { productId: string; onApplied: () => void }) {
  const { t, lang } = useI18n()
  const [result, setResult] = useState<PriceCalculation | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(apply: boolean) {
    setBusy(true)
    setError('')
    try {
      setResult(await recalculatePrice(productId, apply))
      if (apply) onApplied()
    } catch (err) {
      setResult(null)
      setError(getErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const money = (v: number) => formatMoney(v, result?.currency ?? 'EUR', lang)
  return (
    <section className="card">
      <h2 className="card-title">{t.adminProducts.pricing}</h2>
      <p className="muted small">{t.adminProducts.pricingHint}</p>
      <div className="form-actions">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(false)}>
          {t.adminProducts.preview}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(true)}>
          {t.adminProducts.apply}
        </button>
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
      {result && (
        <dl className="detail-list mt">
          <dt>{t.adminPricing.cost}</dt>
          <dd>{money(result.cost)}</dd>
          <dt>{t.adminPricing.rule}</dt>
          <dd>
            {result.rule_name} ({result.margin_percent} %{result.fixed_amount ? ` + ${money(result.fixed_amount)}` : ''}
            )
          </dd>
          <dt>{t.adminProducts.publicPrice}</dt>
          <dd>
            <strong>{money(result.price)}</strong> {result.applied ? `· ${t.adminProducts.applied}` : ''}
          </dd>
        </dl>
      )}
    </section>
  )
}
