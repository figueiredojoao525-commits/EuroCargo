import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { Spinner } from '../components/Spinner'
import { useI18n } from '../i18n/context'
import { isSupabaseConfigured } from '../lib/supabase'

/** Scrolls to `#section` anchors after navigation, or to the top on page change. */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])
}

export function MainLayout() {
  const { t } = useI18n()
  useScrollOnNavigate()

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        {t.nav.skipToContent}
      </a>
      <Header />
      {!isSupabaseConfigured && (
        <div className="container config-banner">
          <Alert tone="warning">{t.common.notConfigured}</Alert>
        </div>
      )}
      <main id="main">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
