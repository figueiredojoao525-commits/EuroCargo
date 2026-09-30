import { useI18n } from '../i18n/context'

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label ?? t.common.loading}</span>
    </div>
  )
}
