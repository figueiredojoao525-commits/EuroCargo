import { lazy, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { RequireAuth } from './components/ProtectedRoute'
import { AdminLayout } from './layouts/AdminLayout'
import { MainLayout } from './layouts/MainLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LegalPage } from './pages/LegalPage'
import { LoginPage } from './pages/LoginPage'
import { NewShipmentPage } from './pages/NewShipmentPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PaymentReturnPage } from './pages/PaymentReturnPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { ShipmentPage } from './pages/ShipmentPage'
import { TrackPage } from './pages/TrackPage'

/** Code-split page: loaded on first visit (the homepage bundle stays small). */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const ShopPage = lazyPage(() => import('./pages/shop/ShopPage'), 'ShopPage')
const ProductPage = lazyPage(() => import('./pages/shop/ProductPage'), 'ProductPage')
const VehiclesPage = lazyPage(() => import('./pages/shop/VehiclesPage'), 'VehiclesPage')
const CategoriesPage = lazyPage(() => import('./pages/shop/CategoriesPage'), 'CategoriesPage')
const CartPage = lazyPage(() => import('./pages/shop/CartPage'), 'CartPage')
const OrderPage = lazyPage(() => import('./pages/shop/OrderPage'), 'OrderPage')

const AdminDashboardPage = lazyPage(() => import('./pages/admin/AdminDashboardPage'), 'AdminDashboardPage')
const AdminShipmentPage = lazyPage(() => import('./pages/admin/AdminShipmentPage'), 'AdminShipmentPage')
const AdminShipmentNewPage = lazyPage(() => import('./pages/admin/AdminShipmentNewPage'), 'AdminShipmentNewPage')
const AdminPaymentsPage = lazyPage(() => import('./pages/admin/AdminPaymentsPage'), 'AdminPaymentsPage')
const AdminProductsPage = lazyPage(() => import('./pages/admin/AdminProductsPage'), 'AdminProductsPage')
const AdminProductEditPage = lazyPage(() => import('./pages/admin/AdminProductEditPage'), 'AdminProductEditPage')
const AdminBrandsPage = lazyPage(() => import('./pages/admin/AdminBrandsPage'), 'AdminBrandsPage')
const AdminSuppliersPage = lazyPage(() => import('./pages/admin/AdminSuppliersPage'), 'AdminSuppliersPage')
const AdminCatalogPage = lazyPage(() => import('./pages/admin/AdminCatalogPage'), 'AdminCatalogPage')
const AdminPricingPage = lazyPage(() => import('./pages/admin/AdminPricingPage'), 'AdminPricingPage')
const AdminCustomersPage = lazyPage(() => import('./pages/admin/AdminCustomersPage'), 'AdminCustomersPage')
const AdminOrdersPage = lazyPage(() => import('./pages/admin/AdminOrdersPage'), 'AdminOrdersPage')
const AdminOrderNewPage = lazyPage(() => import('./pages/admin/AdminOrderNewPage'), 'AdminOrderNewPage')
const AdminOrderPage = lazyPage(() => import('./pages/admin/AdminOrderPage'), 'AdminOrderPage')
const AdminAiPage = lazyPage(() => import('./pages/admin/AdminAiPage'), 'AdminAiPage')

const authed = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>

/** Old tracking URL: keeps existing /track?code=... links working. */
function LegacyTrackRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/rastrear${search}`} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<MainLayout />}>
          {/* Public */}
          <Route index element={<HomePage />} />
          <Route path="rastrear" element={<TrackPage />} />
          <Route path="track" element={<LegacyTrackRedirect />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="terms" element={<LegalPage kind="terms" />} />
          <Route path="privacy" element={<LegalPage kind="privacy" />} />

          {/* Parts shop (public; sending a request requires an account) */}
          <Route path="pecas" element={<ShopPage />} />
          <Route path="pecas/:id" element={<ProductPage />} />
          <Route path="veiculos" element={<VehiclesPage />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="carrinho" element={<CartPage />} />
          <Route path="pedido" element={<Navigate to="/carrinho" replace />} />

          {/* Customer (also used by admins to create shipments) */}
          <Route path="dashboard" element={authed(<DashboardPage />)} />
          <Route path="pedidos/:id" element={authed(<OrderPage />)} />
          <Route path="shipments/new" element={authed(<NewShipmentPage />)} />
          <Route path="shipments/:id" element={authed(<ShipmentPage />)} />
          <Route path="payment/return" element={authed(<PaymentReturnPage />)} />

          {/* Admin — UI guard only; the database enforces authorisation */}
          <Route path="admin" element={authed(<AdminLayout />)}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="shipments/new" element={<AdminShipmentNewPage />} />
            <Route path="shipments/:id" element={<AdminShipmentPage />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="orders/new" element={<AdminOrderNewPage />} />
            <Route path="orders/:id" element={<AdminOrderPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="products/new" element={<AdminProductEditPage />} />
            <Route path="products/:id" element={<AdminProductEditPage />} />
            <Route path="brands" element={<AdminBrandsPage />} />
            <Route path="suppliers" element={<AdminSuppliersPage />} />
            <Route path="catalog" element={<AdminCatalogPage />} />
            <Route path="pricing" element={<AdminPricingPage />} />
            <Route path="ai" element={<AdminAiPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
