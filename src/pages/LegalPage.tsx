import { Alert } from '../components/Alert'
import { useI18n } from '../i18n/context'

// The legal text must be written/approved by the company; until then only a notice is shown.
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useI18n()
  return (
    <div className="container page page-narrow">
      <h1>{kind === 'terms' ? t.legal.termsTitle : t.legal.privacyTitle}</h1>
      <Alert tone="info">{t.legal.draftNotice}</Alert>
    </div>
  )
}
