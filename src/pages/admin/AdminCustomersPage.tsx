import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { CrudManager, type CrudField } from '../../components/admin/CrudManager'
import { Pagination } from '../../components/Pagination'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { ADMIN_LIST_SIZE } from '../../services/adminCatalog'
import { listCustomers, saveCustomer } from '../../services/adminOrders'
import { getErrorMessage } from '../../services/errors'
import { ORDER_CHANNELS, type Customer } from '../../types'
import { formatDate } from '../../utils/format'

/** /admin/customers — account holders and customers created by staff (phone, WhatsApp, in person). */
export function AdminCustomersPage() {
  const { t, lang } = useI18n()
  const [search, setSearch] = useState('')
  const [text, setText] = useState('')
  const [page, setPage] = useState(0)
  const customers = useAsync(() => listCustomers(text, page), [text, page])

  const fields: CrudField<Customer>[] = [
    { key: 'full_name', label: t.auth.fullName, required: true, maxLength: 120, column: true },
    { key: 'phone', label: t.auth.phone, maxLength: 30, column: true },
    { key: 'email', label: t.auth.email, type: 'email', maxLength: 200, column: true },
    { key: 'country', label: t.auth.country, type: 'country' },
    { key: 'tax_id', label: t.adminCustomers.taxId, maxLength: 30 },
    {
      key: 'source',
      label: t.adminCustomers.source,
      type: 'select',
      required: true,
      initial: 'phone',
      column: true,
      options: ORDER_CHANNELS.map((c) => ({ value: c, label: t.channel[c] })),
    },
    {
      key: 'user_id',
      label: t.adminCustomers.account,
      column: true,
      render: (c) => (c.user_id ? t.adminCustomers.hasAccount : t.adminCustomers.noAccount),
      displayOnly: true,
    },
    {
      key: 'created_at',
      label: t.dashboard.date,
      column: true,
      render: (c) => formatDate(c.created_at, lang),
      displayOnly: true,
    },
  ]

  return (
    <>
      <h1>{t.adminNav.customers}</h1>
      <p className="muted">{t.adminCustomers.intro}</p>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault()
          setText(search)
          setPage(0)
        }}
      >
        <label htmlFor="customer-search" className="sr-only">
          {t.adminCustomers.search}
        </label>
        <input
          id="customer-search"
          type="search"
          placeholder={t.adminCustomers.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-outline">
          {t.admin.filters.apply}
        </button>
      </form>
      {customers.error !== undefined && <Alert tone="error">{getErrorMessage(customers.error, t)}</Alert>}
      {customers.loading && !customers.data ? (
        <Spinner />
      ) : (
        <>
          <CrudManager
            title={t.adminNav.customers}
            rows={customers.data?.rows ?? []}
            fields={fields}
            onSave={saveCustomer}
            onChanged={customers.reload}
            actions={(c) => (
              <Link to={`/admin/orders/new?customer=${c.id}`} className="btn btn-outline btn-sm">
                {t.adminOrders.newOrder}
              </Link>
            )}
          />
          <Pagination page={page} pageSize={ADMIN_LIST_SIZE} total={customers.data?.total ?? 0} onChange={setPage} />
        </>
      )}
    </>
  )
}
