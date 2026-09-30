import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Icon } from '../../components/Icon'
import { Pagination } from '../../components/Pagination'
import { Spinner } from '../../components/Spinner'
import { OrderStatusBadge } from '../../components/StatusBadge'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { ADMIN_LIST_SIZE } from '../../services/adminCatalog'
import { listOrders, type OrderFilters } from '../../services/adminOrders'
import { getErrorMessage } from '../../services/errors'
import { ORDER_STATUSES } from '../../types'
import { formatDate, formatMoney } from '../../utils/format'

const EMPTY: OrderFilters = { text: '', status: '' }

/** /admin/orders */
export function AdminOrdersPage() {
  const { t, lang } = useI18n()
  const [draft, setDraft] = useState<OrderFilters>(EMPTY)
  const [filters, setFilters] = useState<OrderFilters>(EMPTY)
  const [page, setPage] = useState(0)
  const orders = useAsync(() => listOrders(filters, page), [filters, page])

  function apply(event: FormEvent) {
    event.preventDefault()
    setFilters(draft)
    setPage(0)
  }

  return (
    <>
      <div className="page-header">
        <h1>{t.adminNav.orders}</h1>
        <Link to="/admin/orders/new" className="btn btn-primary">
          <Icon name="plus" size={18} />
          {t.adminOrders.newOrder}
        </Link>
      </div>
      <form className="filters" onSubmit={apply}>
        <input
          type="search"
          aria-label={t.adminOrders.searchNumber}
          placeholder={t.adminOrders.searchNumber}
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
        <select
          aria-label={t.dashboard.status}
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as OrderFilters['status'] })}
        >
          <option value="">{t.admin.filters.all}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.orderStatus[s]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-outline">
          {t.admin.filters.apply}
        </button>
      </form>

      {orders.error !== undefined && <Alert tone="error">{getErrorMessage(orders.error, t)}</Alert>}
      {orders.loading && !orders.data && <Spinner />}
      {orders.data && orders.data.rows.length === 0 && <p className="card empty">{t.adminCommon.empty}</p>}
      {orders.data && orders.data.rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.dashboard.date}</th>
                  <th>{t.orders.order}</th>
                  <th>{t.adminOrders.customer}</th>
                  <th>{t.adminOrders.channel}</th>
                  <th>{t.dashboard.status}</th>
                  <th>{t.orders.total}</th>
                  <th>
                    <span className="sr-only">{t.common.details}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.data.rows.map((o) => (
                  <tr key={o.id}>
                    <td className="nowrap">{formatDate(o.created_at, lang)}</td>
                    <td className="mono nowrap">{o.order_number}</td>
                    <td>{o.customer?.full_name ?? t.common.none}</td>
                    <td>{t.channel[o.channel]}</td>
                    <td>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="nowrap">{formatMoney(o.total, o.currency, lang)}</td>
                    <td>
                      <Link to={`/admin/orders/${o.id}`} className="btn btn-outline btn-sm">
                        {t.common.details}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={ADMIN_LIST_SIZE} total={orders.data.total} onChange={setPage} />
        </>
      )}
    </>
  )
}
