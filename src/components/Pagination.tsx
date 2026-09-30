import { useI18n } from '../i18n/context'

interface Props {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const { t } = useI18n()
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  return (
    <div className="pagination">
      <button type="button" className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
        {t.common.previous}
      </button>
      <span className="muted">
        {page + 1} / {pages}
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
      >
        {t.common.next}
      </button>
    </div>
  )
}
