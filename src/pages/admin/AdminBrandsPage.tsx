import { Alert } from '../../components/Alert'
import { CrudManager, type CrudField } from '../../components/admin/CrudManager'
import { Spinner } from '../../components/Spinner'
import { DemoBadge } from '../../components/shop/Badges'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { deleteBrand, listBrands, saveBrand } from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import type { Brand } from '../../types'
import { withSlug } from '../../utils/catalog'

/** /admin/brands — part manufacturers / brands. */
export function AdminBrandsPage() {
  const { t } = useI18n()
  const brands = useAsync(listBrands, [])
  const fields: CrudField<Brand>[] = [
    {
      key: 'name',
      label: t.adminCommon.name,
      required: true,
      maxLength: 80,
      column: true,
      render: (b) => (
        <>
          {b.name} {b.is_demo && <DemoBadge />}
        </>
      ),
    },
    { key: 'slug', label: t.adminCommon.slug, hint: t.adminCommon.slugHint, maxLength: 80, column: true },
    { key: 'country', label: t.auth.country, type: 'country', column: true },
    { key: 'website', label: t.adminCommon.website, type: 'url', maxLength: 200 },
    { key: 'active', label: t.adminCommon.active, type: 'checkbox', initial: true, column: true },
  ]

  return (
    <>
      <h1>{t.adminNav.brands}</h1>
      {brands.error !== undefined && <Alert tone="error">{getErrorMessage(brands.error, t)}</Alert>}
      {brands.loading && !brands.data ? (
        <Spinner />
      ) : (
        <CrudManager
          title={t.adminNav.brands}
          rows={brands.data ?? []}
          fields={fields}
          onSave={(row, id) => saveBrand(withSlug(row), id)}
          onDelete={deleteBrand}
          onChanged={brands.reload}
        />
      )}
    </>
  )
}
