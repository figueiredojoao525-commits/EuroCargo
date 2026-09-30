import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { Pagination } from '../../components/Pagination'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { ADMIN_LIST_SIZE, listAiLogs } from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import { formatDateTime } from '../../utils/format'

const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER === 'external' ? 'external' : 'local'
const CATALOG_PROVIDER = import.meta.env.VITE_CATALOG_PROVIDER === 'external' ? 'external' : 'local'

/** /admin/ai — assistant configuration status and what customers searched for. */
export function AdminAiPage() {
  const { t, lang } = useI18n()
  const [onlyUnmatched, setOnlyUnmatched] = useState(false)
  const [page, setPage] = useState(0)
  const logs = useAsync(() => listAiLogs(onlyUnmatched, page), [onlyUnmatched, page])

  return (
    <>
      <h1>{t.adminNav.ai}</h1>
      <div className="grid grid-2">
        <section className="card">
          <h2 className="card-title">{t.adminAi.assistant}</h2>
          <dl className="detail-list">
            <dt>{t.adminAi.aiProvider}</dt>
            <dd>{t.adminAi.providers[AI_PROVIDER]}</dd>
            <dt>{t.adminAi.catalogProvider}</dt>
            <dd>{t.adminAi.providers[CATALOG_PROVIDER]}</dd>
          </dl>
          <p className="muted small">{t.adminAi.rules}</p>
        </section>
        <section className="card">
          <h2 className="card-title">{t.adminAi.integrations}</h2>
          <p className="muted small">{t.adminAi.integrationsText}</p>
        </section>
      </div>

      <div className="page-header mt">
        <h2>{t.adminAi.searches}</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={onlyUnmatched}
            onChange={(e) => {
              setOnlyUnmatched(e.target.checked)
              setPage(0)
            }}
          />
          {t.adminAi.onlyUnmatched}
        </label>
      </div>
      <p className="muted small">{t.adminAi.searchesHint}</p>

      {logs.error !== undefined && <Alert tone="error">{getErrorMessage(logs.error, t)}</Alert>}
      {logs.loading && !logs.data && <Spinner />}
      {logs.data && logs.data.rows.length === 0 && <p className="card empty">{t.adminCommon.empty}</p>}
      {logs.data && logs.data.rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.dashboard.date}</th>
                  <th>{t.adminAi.query}</th>
                  <th>{t.adminAi.understood}</th>
                  <th>{t.adminAi.results}</th>
                  <th>{t.adminAi.matched}</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.rows.map((log) => {
                  const p = log.parsed as Record<string, string | number | undefined>
                  return (
                    <tr key={log.id}>
                      <td className="nowrap">{formatDateTime(log.created_at, lang)}</td>
                      <td>{log.query}</td>
                      <td className="muted small">
                        {[p.text, p.make, p.model, p.year, p.condition, p.reference].filter(Boolean).join(' · ') ||
                          t.common.none}
                      </td>
                      <td>{log.results_count}</td>
                      <td>
                        <span className={`badge ${log.matched ? 'badge-delivered' : 'badge-created'}`}>
                          {log.matched ? t.adminCommon.yes : t.adminCommon.no}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={ADMIN_LIST_SIZE} total={logs.data.total} onChange={setPage} />
        </>
      )}
    </>
  )
}
