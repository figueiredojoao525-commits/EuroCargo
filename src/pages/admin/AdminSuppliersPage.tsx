import { Alert } from '../../components/Alert'
import { CrudManager, type CrudField } from '../../components/admin/CrudManager'
import { Spinner } from '../../components/Spinner'
import { DemoBadge } from '../../components/shop/Badges'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { deleteSupplier, listSuppliers, saveSupplier } from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import type { Supplier } from '../../types'

/** /admin/suppliers — suppliers are internal: never shown to customers. */
export function AdminSuppliersPage() {
  const { t } = useI18n()
  const suppliers = useAsync(listSuppliers, [])
  const fields: CrudField<Supplier>[] = [
    {
      key: 'name',
      label: t.adminCommon.name,
      required: true,
      maxLength: 120,
      column: true,
      render: (s) => (
        <>
          {s.name} {s.is_demo && <DemoBadge />}
        </>
      ),
    },
    { key: 'email', label: t.auth.email, type: 'email', maxLength: 200, column: true },
    { key: 'phone', label: t.auth.phone, maxLength: 30, column: true },
    { key: 'country', label: t.auth.country, type: 'country', column: true },
    { key: 'website', label: t.adminCommon.website, type: 'url', maxLength: 200 },
    { key: 'notes', label: t.adminCommon.notes, type: 'textarea', maxLength: 2000 },
    { key: 'active', label: t.adminCommon.active, type: 'checkbox', initial: true, column: true },
  ]

  return (
    <>
      <h1>{t.adminNav.suppliers}</h1>
      <p className="muted">{t.adminSuppliers.intro}</p>
      {suppliers.error !== undefined && <Alert tone="error">{getErrorMessage(suppliers.error, t)}</Alert>}
      {suppliers.loading && !suppliers.data ? (
        <Spinner />
      ) : (
        <CrudManager
          title={t.adminNav.suppliers}
          rows={suppliers.data ?? []}
          fields={fields}
          onSave={saveSupplier}
          onDelete={deleteSupplier}
          onChanged={suppliers.reload}
        />
      )}
    </>
  )
}
