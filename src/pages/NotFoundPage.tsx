import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/context'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="container page page-narrow center">
      <h1>{t.notFound.title}</h1>
      <p className="muted">{t.notFound.text}</p>
      <Link to="/" className="btn btn-primary">
        {t.notFound.back}
      </Link>
    </div>
  )
}
