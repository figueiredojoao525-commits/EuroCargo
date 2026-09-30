import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Pagination } from '../../components/Pagination'
import { ShipmentFiltersForm } from '../../components/ShipmentFiltersForm'
import { Spinner } from '../../components/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import {
  ADMIN_PAGE_SIZE,
  EMPTY_FILTERS,
  getAdminStats,
  listShipments,
  type ShipmentFilters,
} from '../../services/admin'
import { getErrorMessage } from '../../services/errors'
import { formatDate } from '../../utils/format'

export function AdminDashboardPage() {
  const { t, lang } = useI18n()
  const [filters, setFilters] = useState<ShipmentFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)

  const stats = useAsync(getAdminStats, [])
  const list = useAsync(() => listShipments(filters, page), [filters, page])

  const statItems = stats.data
    ? [
        { label: t.admin.stats.total, value: stats.data.total },
        { label: t.admin.stats.pending, value: stats.data.pending },
        { label: t.admin.stats.inTransit, value: stats.data.in_transit },
        { label: t.admin.stats.delivered, value: stats.data.delivered },
        { label: t.admin.stats.paymentsConfirmed, value: stats.data.payments_paid },
        { label: t.admin.stats.ordersNew, value: stats.data.orders_new, to: '/admin/orders' },
        { label: t.admin.stats.ordersOpen, value: stats.data.orders_open, to: '/admin/orders' },
        { label: t.admin.stats.products, value: stats.data.products_active, to: '/admin/products' },
        { label: t.admin.stats.customers, value: stats.data.customers, to: '/admin/customers' },
      ]
    : []

  return (
    <>
      <h1>{t.admin.title}</h1>

      {stats.error !== undefined && <Alert tone="error">{getErrorMessage(stats.error, t)}</Alert>}
      {statItems.length > 0 && (
        <div className="stats">
          {statItems.map((item) => (
            <div key={item.label} className="stat">
              <div className="stat-value">{item.value}</div>
              <div className="stat-label">
                {'to' in item && item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>{t.admin.shipments}</h2>
      <ShipmentFiltersForm
        initial={filters}
        onApply={(next) => {
          setFilters(next)
          setPage(0)
        }}
      />

      {list.loading && !list.data && <Spinner />}
      {list.error !== undefined && <Alert tone="error">{getErrorMessage(list.error, t)}</Alert>}
      {list.data && list.data.rows.length === 0 && <p className="card empty">{t.admin.empty}</p>}
      {list.data && list.data.rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.dashboard.date}</th>
                  <th>{t.dashboard.trackingCode}</th>
                  <th>{t.admin.filters.origin}</th>
                  <th>{t.admin.filters.destination}</th>
                  <th>{t.dashboard.status}</th>
                  <th>
                    <span className="sr-only">{t.common.details}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.rows.map((shipment) => (
                  <tr key={shipment.id}>
                    <td className="nowrap">{formatDate(shipment.created_at, lang)}</td>
                    <td className="mono nowrap">{shipment.tracking_code ?? t.common.none}</td>
                    <td>
                      {shipment.sender_city} ({shipment.sender_country})
                    </td>
                    <td>
                      {shipment.recipient_city} ({shipment.recipient_country})
                    </td>
                    <td>
                      <StatusBadge status={shipment.status} />
                    </td>
                    <td>
                      <Link to={`/admin/shipments/${shipment.id}`} className="btn btn-outline btn-sm">
                        {t.common.details}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} total={list.data.total} onChange={setPage} />
        </>
      )}
    </>
  )
}
