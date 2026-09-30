import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n/context'
import { isExplicitSignOut } from '../services/auth'
import { Alert } from './Alert'
import { Spinner } from './Spinner'

/** Redirects anonymous visitors to /login (and back afterwards); after an explicit sign-out, to the homepage. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!user) {
    // The session is already gone at this point (user is null); only the destination differs.
    if (isExplicitSignOut()) return <Navigate to="/" replace />
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children
}

/**
 * Hides admin screens from non-admins. This is a UX guard only: every admin
 * query and action is also checked by RLS policies / is_admin() in the database.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth()
  const { t } = useI18n()

  if (loading) return <Spinner />
  if (!isAdmin) {
    return (
      <div className="container page">
        <Alert tone="error">{t.admin.accessDenied}</Alert>
      </div>
    )
  }
  return children
}
