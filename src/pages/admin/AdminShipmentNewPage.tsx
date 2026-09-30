import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AdminShipmentForm } from '../../components/admin/AdminShipmentForm'
import { Icon } from '../../components/Icon'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { listCustomers } from '../../services/adminOrders'
import type { Customer } from '../../types'

/** /admin/shipments/new — shipment registered by staff, with the tracking code issued immediately. */
export function AdminShipmentNewPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const found = useAsync(() => (query ? listCustomers(query, 0) : Promise.resolve(null)), [query])

  return (
    <>
      <Link to="/admin" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.common.back}
      </Link>
      <h1>{t.adminShipments.newTitle}</h1>
      <p className="muted">{t.adminShipments.newIntro}</p>

      <section className="card">
        <h2 className="card-title">
          {t.adminOrders.customer} ({t.common.optional})
        </h2>
        {customer ? (
          <div className="form-actions">
            <strong>{customer.full_name}</strong>
            <span className="muted">{[customer.phone, customer.email].filter(Boolean).join(' · ')}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCustomer(null)}>
              {t.adminOrders.changeCustomer}
            </button>
          </div>
        ) : (
          <>
            <div className="input-row">
              <label htmlFor="s-search" className="sr-only">
                {t.adminCustomers.search}
              </label>
              <input
                id="s-search"
                type="search"
                placeholder={t.adminCustomers.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQuery(search.trim())
                }}
              />
              <button type="button" className="btn btn-outline" onClick={() => setQuery(search.trim())}>
                {t.shop.searchButton}
              </button>
            </div>
            {found.data && (
              <ul className="picker-results">
                {found.data.rows.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCustomer(c)}>
                      <span>{c.full_name}</span>
                      <span className="muted small">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">{t.adminShipments.customerHint}</p>
          </>
        )}
      </section>

      <div className="mt">
        <AdminShipmentForm
          key={customer?.id ?? 'none'}
          customerId={customer?.id ?? null}
          orderId={null}
          recipient={
            customer
              ? { name: customer.full_name, phone: customer.phone ?? '', country: customer.country ?? '' }
              : undefined
          }
          onCreated={(r) => navigate(`/admin/shipments/${r.id}`)}
        />
      </div>
    </>
  )
}
