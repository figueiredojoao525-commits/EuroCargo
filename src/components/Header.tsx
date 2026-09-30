import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../services/cart'
import { useI18n } from '../i18n/context'
import { signOut } from '../services/auth'
import { Icon } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Logo } from './Logo'

export function Header() {
  const { t } = useI18n()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const cartCount = useCart().reduce((sum, line) => sum + line.quantity, 0)

  // Purely visual: stronger background and shadow once the page is scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleLogout() {
    try {
      await signOut()
    } finally {
      navigate('/', { replace: true })
    }
  }

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container header-inner">
        <Logo />
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          aria-label={t.nav.menu}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'close' : 'menu'} />
        </button>

        {/* Clicking any link inside closes the mobile menu. */}
        <div id="main-nav" className={`nav-panel${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
          <nav className="nav-links" aria-label={t.nav.mainNav}>
            <NavLink to="/" end>
              {t.nav.home}
            </NavLink>
            <NavLink to="/pecas">{t.nav.parts}</NavLink>
            <Link to="/#services">{t.nav.services}</Link>
            <NavLink to="/rastrear">{t.nav.tracking}</NavLink>
            <Link to="/#how-it-works">{t.nav.howItWorks}</Link>
            <Link to="/#contacts">{t.nav.contacts}</Link>
          </nav>
          <div className="nav-actions">
            <NavLink to="/carrinho" className="cart-link" aria-label={`${t.nav.cart} (${cartCount})`}>
              <Icon name="cart" size={20} />
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </NavLink>
            <LanguageSwitcher />
            {user ? (
              <>
                {isAdmin && (
                  <NavLink to="/admin" className="btn btn-ghost btn-sm">
                    {t.nav.admin}
                  </NavLink>
                )}
                <NavLink to="/dashboard" className="btn btn-outline btn-sm">
                  {t.nav.dashboard}
                </NavLink>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                  {t.nav.logout}
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn btn-ghost btn-sm">
                  {t.nav.login}
                </NavLink>
                <NavLink to="/register" className="btn btn-primary btn-sm btn-cta btn-arrow">
                  {t.nav.register}
                  <Icon name="arrowRight" size={16} />
                </NavLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
