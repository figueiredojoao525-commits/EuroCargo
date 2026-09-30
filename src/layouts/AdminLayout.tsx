import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { RequireAdmin } from '../components/ProtectedRoute'
import { Spinner } from '../components/Spinner'
import { useI18n } from '../i18n/context'

export function AdminLayout() {
  const { t } = useI18n()
  const links = [
    { to: '/admin', label: t.admin.overview, end: true },
    { to: '/admin/orders', label: t.adminNav.orders },
    { to: '/admin/customers', label: t.adminNav.customers },
    { to: '/admin/shipments/new', label: t.adminShipments.newTitle },
    { to: '/admin/products', label: t.adminNav.products },
    { to: '/admin/catalog', label: t.adminNav.catalog },
    { to: '/admin/brands', label: t.adminNav.brands },
    { to: '/admin/suppliers', label: t.adminNav.suppliers },
    { to: '/admin/pricing', label: t.adminNav.pricing },
    { to: '/admin/payments', label: t.admin.payments },
    { to: '/admin/ai', label: t.adminNav.ai },
  ]
  return (
    <RequireAdmin>
      <div className="container page">
        <nav className="admin-nav" aria-label={t.admin.title}>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </div>
    </RequireAdmin>
  )
}
