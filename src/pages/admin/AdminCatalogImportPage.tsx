import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Field } from '../../components/Field'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { interpolate, type Dictionary } from '../../i18n'
import { useI18n } from '../../i18n/context'
import {
  autoMapping,
  FIELD_GROUPS,
  isMigrationMissing,
  listCatalogSources,
  listImportBatches,
  MAX_FILE_BYTES,
  parseFile,
  prepareImport,
  runImport,
  type ColumnMapping,
  type ImportField,
  type ImportProgress,
  type ImportRecord,
} from '../../services/catalogImport'
import { getErrorMessage } from '../../services/errors'
import { IMPORT_MODES, type ImportBatch, type ImportMode } from '../../types'
import { formatDateTime } from '../../utils/format'

const PREVIEW_ROWS = 50

interface LoadedFile {
  name: string
  format: 'csv' | 'json' | 'xml'
  records: ImportRecord[]
  columns: string[]
}

/** "invalid_price: abc" → "Preço inválido: abc" */
function issueLabel(issue: string, t: Dictionary): string {
  const [code, ...rest] = issue.split(':')
  const issues = t.adminImport.issues as Record<string, string>
  const label = issues[code.trim()] ?? code.trim()
  return rest.length ? `${label}:${rest.join(':')}` : label
}

function sampleOf(records: ImportRecord[], column: string): string {
  const value = records.find((r) => r[column] !== undefined && r[column] !== '' && r[column] !== null)?.[column]
  if (value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

function batchResult(batch: ImportBatch): string {
  return `${batch.inserted} + ${batch.updated} ↻ · ${batch.skipped} ⤼ · ${batch.failed} ✘`
}

/** /admin/catalog/import — bulk import from CSV / JSON / XML files. */
export function AdminCatalogImportPage() {
  const { t, lang } = useI18n()
  const sources = useAsync(listCatalogSources, [])
  const batches = useAsync(() => listImportBatches(15), [])

  const [sourceId, setSourceId] = useState('')
  const [mode, setMode] = useState<ImportMode>('upsert')
  const [createReferenceData, setCreateReferenceData] = useState(true)
  const [deactivateMissing, setDeactivateMissing] = useState(false)
  const [recordTag, setRecordTag] = useState('')
  const [rawText, setRawText] = useState<{ name: string; text: string } | null>(null)
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState<ImportBatch | null>(null)
  const cancelRef = useRef(false)

  const importable = useMemo(() => (sources.data ?? []).filter((s) => s.enabled && s.mode !== 'live'), [sources.data])
  const source = importable.find((s) => s.id === sourceId) ?? importable[0]
  const defaultCondition = source?.default_condition ?? null

  const prepared = useMemo(
    () =>
      file
        ? prepareImport(file.records, mapping, {
            mode,
            defaultCondition,
            firstLine: file.format === 'csv' ? 2 : 1,
          })
        : null,
    [file, mapping, mode, defaultCondition],
  )

  function load(name: string, text: string, tag: string) {
    setError('')
    setFinished(null)
    setProgress(null)
    try {
      const parsed = parseFile(name, text, { recordTag: tag.trim() || undefined })
      setFile({ name, ...parsed })
      setMapping(autoMapping(parsed.columns))
    } catch (err) {
      setFile(null)
      setError(interpolate(t.adminImport.parseError, { error: (err as Error).message }))
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    if (chosen.size > MAX_FILE_BYTES) {
      setError(t.adminImport.fileTooLarge)
      return
    }
    const text = await chosen.text()
    setRawText({ name: chosen.name, text })
    load(chosen.name, text, recordTag)
  }

  async function handleImport() {
    if (!prepared || !source || !file) return
    cancelRef.current = false
    setRunning(true)
    setError('')
    setFinished(null)
    try {
      const batch = await runImport(prepared.valid, {
        sourceId: source.id,
        format: file.format,
        fileName: file.name,
        mode,
        createReferenceData,
        deactivateMissing: deactivateMissing && mode === 'upsert',
        onProgress: setProgress,
        isCancelled: () => cancelRef.current,
      })
      setFinished(batch)
      batches.reload()
      sources.reload()
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setRunning(false)
    }
  }

  if (sources.error !== undefined) {
    return (
      <>
        <h1>{t.adminNav.catalogImport}</h1>
        <Alert tone={isMigrationMissing(sources.error) ? 'warning' : 'error'}>
          {isMigrationMissing(sources.error) ? t.adminImport.migrationMissing : getErrorMessage(sources.error, t)}
        </Alert>
      </>
    )
  }
  if (!sources.data) return <Spinner />

  const previewRows = (prepared?.rows ?? [])
    .filter((r) => !onlyIssues || r.errors.length || r.warnings.length)
    .slice(0, PREVIEW_ROWS)

  return (
    <>
      <h1>{t.adminNav.catalogImport}</h1>
      <p className="muted">{t.adminImport.intro}</p>
      <div className="inline-actions">
        <a className="btn btn-outline btn-sm" href="/templates/modelo-importacao-eurocargo.csv" download>
          {t.adminImport.downloadTemplate}
        </a>
        <span className="muted small">{t.adminImport.formatHelp}</span>
      </div>
      <p className="muted small">{t.adminImport.largeFiles}</p>

      <section className="card stack">
        {importable.length === 0 ? (
          <Alert tone="info">
            {t.adminImport.noSources} <Link to="/admin/catalog/providers">{t.adminNav.catalogProviders}</Link>
          </Alert>
        ) : (
          <div className="form-grid">
            <Field label={t.adminImport.source} htmlFor="import-source" hint={t.adminImport.sourceHint}>
              <select
                id="import-source"
                value={source?.id ?? ''}
                disabled={running}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {importable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.key})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.adminImport.mode} htmlFor="import-mode">
              <select
                id="import-mode"
                value={mode}
                disabled={running}
                onChange={(e) => setMode(e.target.value as ImportMode)}
              >
                {IMPORT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t.adminImport.modes[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {source && (
          <p className="muted small">
            {t.adminImport.lastSync}:{' '}
            {source.last_sync_at ? formatDateTime(source.last_sync_at, lang) : t.adminImport.never}
            {source.last_sync_message && ` · ${source.last_sync_message}`}
          </p>
        )}

        <Field label={t.adminImport.file} htmlFor="import-file" hint={t.adminImport.fileHint}>
          <input
            id="import-file"
            type="file"
            accept=".csv,.tsv,.txt,.json,.xml,text/csv,application/json,application/xml,text/xml"
            disabled={running || importable.length === 0}
            onChange={handleFile}
          />
        </Field>
        {file?.format === 'xml' && (
          <Field label={t.adminImport.recordTag} htmlFor="import-tag" hint={t.adminImport.recordTagHint}>
            <div className="input-row">
              <input id="import-tag" value={recordTag} maxLength={60} onChange={(e) => setRecordTag(e.target.value)} />
              <button
                type="button"
                className="btn btn-outline"
                disabled={!rawText}
                onClick={() => rawText && load(rawText.name, rawText.text, recordTag)}
              >
                {t.adminImport.validate}
              </button>
            </div>
          </Field>
        )}
        <label className="checkbox" htmlFor="import-create">
          <input
            id="import-create"
            type="checkbox"
            checked={createReferenceData}
            disabled={running}
            onChange={(e) => setCreateReferenceData(e.target.checked)}
          />
          {t.adminImport.createReferenceData}
        </label>
        {mode === 'upsert' && (
          <label className="checkbox" htmlFor="import-deactivate">
            <input
              id="import-deactivate"
              type="checkbox"
              checked={deactivateMissing}
              disabled={running}
              onChange={(e) => setDeactivateMissing(e.target.checked)}
            />
            {t.adminImport.deactivateMissing}
          </label>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </section>

      {file && (
        <section className="card stack mt">
          <h2 className="card-title">{t.adminImport.mapping}</h2>
          <p className="muted small">
            {interpolate(t.adminImport.records, { count: String(file.records.length), format: file.format.toUpperCase() })}{' '}
            {t.adminImport.mappingHint}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.adminImport.column}</th>
                  <th>{t.adminImport.sample}</th>
                  <th>{t.adminImport.field}</th>
                </tr>
              </thead>
              <tbody>
                {file.columns.map((column) => (
                  <tr key={column}>
                    <td className="mono small">{column}</td>
                    <td className="small muted">{sampleOf(file.records, column)}</td>
                    <td>
                      <select
                        aria-label={`${t.adminImport.field}: ${column}`}
                        value={mapping[column] ?? ''}
                        disabled={running}
                        onChange={(e) => setMapping({ ...mapping, [column]: e.target.value as ImportField | '' })}
                      >
                        <option value="">{t.adminImport.ignore}</option>
                        {FIELD_GROUPS.map((group) => (
                          <optgroup key={group.key} label={t.adminImport.groups[group.key as keyof typeof t.adminImport.groups]}>
                            {group.fields.map((f) => (
                              <option key={f} value={f}>
                                {t.adminImport.fields[f]}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {prepared && (
        <section className="card stack mt">
          <h2 className="card-title">{t.adminImport.preview}</h2>
          <Alert tone={prepared.invalidCount ? 'warning' : 'info'}>
            {interpolate(t.adminImport.summary, {
              valid: String(prepared.valid.length),
              invalid: String(prepared.invalidCount),
              merged: String(prepared.mergedCount),
            })}
          </Alert>
          <label className="checkbox" htmlFor="only-issues">
            <input id="only-issues" type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            {t.adminImport.onlyIssues}
          </label>
          <p className="muted small">{interpolate(t.adminImport.previewHint, { count: String(PREVIEW_ROWS) })}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.adminImport.line}</th>
                  <th>{t.adminImport.fields.name}</th>
                  <th>{t.adminImport.fields.reference}</th>
                  <th>{t.adminImport.fields.brand}</th>
                  <th>{t.adminImport.fields.price}</th>
                  <th>{t.adminImport.fields.vehicles}</th>
                  <th>{t.adminImport.status}</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map(({ line, row, errors, warnings }) => (
                  <tr key={line}>
                    <td className="mono small">{line}</td>
                    <td>{row.name ?? '—'}</td>
                    <td className="mono small">{row.reference ?? row.sku ?? row.external_id ?? '—'}</td>
                    <td>{row.brand ?? '—'}</td>
                    <td className="nowrap">
                      {row.price !== undefined ? `${row.price} ${row.currency ?? ''}` : '—'}
                    </td>
                    <td>{row.vehicles?.length ?? 0}</td>
                    <td className="small">
                      {errors.length === 0 && warnings.length === 0 && (
                        <span className="badge badge-delivered">{t.adminImport.ok}</span>
                      )}
                      {errors.map((e) => (
                        <div key={e} className="text-error">
                          ✘ {issueLabel(e, t)}
                        </div>
                      ))}
                      {warnings.map((w) => (
                        <div key={w} className="muted">
                          ⚠ {issueLabel(w, t)}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="inline-actions">
            <button
              type="button"
              className="btn btn-accent"
              disabled={running || !source || prepared.valid.length === 0}
              onClick={handleImport}
            >
              {interpolate(t.adminImport.import, { count: String(prepared.valid.length) })}
            </button>
            {running && (
              <button type="button" className="btn btn-ghost" onClick={() => (cancelRef.current = true)}>
                {t.adminImport.cancel}
              </button>
            )}
          </div>
          {progress && (
            <div>
              <progress value={progress.sent} max={progress.total} className="import-progress" />
              <p className="muted small">
                {interpolate(t.adminImport.importing, { sent: String(progress.sent), total: String(progress.total) })}
              </p>
            </div>
          )}
          {finished && (
            <Alert tone={finished.failed ? 'warning' : 'success'}>
              {interpolate(t.adminImport.done, {
                inserted: String(finished.inserted),
                updated: String(finished.updated),
                skipped: String(finished.skipped),
                failed: String(finished.failed),
              })}
              {(finished.options?.deactivated ?? 0) > 0 && (
                <> {interpolate(t.adminImport.deactivated, { count: String(finished.options?.deactivated) })}</>
              )}
            </Alert>
          )}
          {progress && (progress.errors.length > 0 || progress.warnings.length > 0) && (
            <details>
              <summary>
                {t.adminImport.serverIssues} ({progress.errors.length + progress.warnings.length})
              </summary>
              <ul className="small">
                {progress.errors.slice(0, 200).map((e, i) => (
                  <li key={`e${i}`} className="text-error">
                    {t.adminImport.line} {e.row}: {issueLabel(e.error, t)}
                  </li>
                ))}
                {progress.warnings.slice(0, 200).map((w, i) => (
                  <li key={`w${i}`} className="muted">
                    {t.adminImport.line} {w.row}: {w.warnings.map((x) => issueLabel(x, t)).join(' · ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="mt">
        <h2>{t.adminImport.history}</h2>
        {batches.error !== undefined && <Alert tone="error">{getErrorMessage(batches.error, t)}</Alert>}
        {batches.data && batches.data.length === 0 && <p className="card empty">{t.adminCommon.empty}</p>}
        {batches.data && batches.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.adminImport.started}</th>
                  <th>{t.adminImport.source}</th>
                  <th>{t.adminImport.file}</th>
                  <th>{t.adminImport.status}</th>
                  <th>{t.adminImport.result}</th>
                </tr>
              </thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.id}>
                    <td className="nowrap small">{formatDateTime(b.started_at, lang)}</td>
                    <td className="mono small">{b.data_source}</td>
                    <td className="small">
                      {b.file_name ?? '—'} ({b.format.toUpperCase()})
                    </td>
                    <td className="small">{b.status}</td>
                    <td className="small nowrap" title={`${b.total_rows}`}>
                      {batchResult(b)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

