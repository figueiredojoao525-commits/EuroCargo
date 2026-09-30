import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { Logo } from './Logo'

const YEAR = new Date().getFullYear()

export function Footer() {
  const { t } = useI18n()

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Logo light />
          <p className="footer-tagline">{t.footer.tagline}</p>
        </div>
        <div>
          <h3>{t.footer.company}</h3>
          <ul>
            <li>
              <Link to="/pecas">{t.nav.parts}</Link>
            </li>
            <li>
              <Link to="/#services">{t.nav.services}</Link>
            </li>
            <li>
              <Link to="/rastrear">{t.nav.tracking}</Link>
            </li>
            <li>
              <Link to="/#contacts">{t.nav.contacts}</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>{t.footer.legal}</h3>
          <ul>
            <li>
              <Link to="/terms">{t.footer.terms}</Link>
            </li>
            <li>
              <Link to="/privacy">{t.footer.privacy}</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        © {YEAR} EuroCargo. {t.footer.rights}
      </div>
    </footer>
  )
}
