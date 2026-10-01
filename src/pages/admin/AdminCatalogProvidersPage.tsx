import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { CrudManager, type CrudField } from '../../components/admin/CrudManager'
import { Spinner } from '../../components/Spinner'
import { useAsync } from '../../hooks/useAsync'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import { listSuppliers } from '../../services/adminCatalog'
import {
  deleteCatalogSource,
  getExternalCatalogStatus,
  isMigrationMissing,
  listCatalogSources,
  runSourceSync,
  saveCatalogSource,
} from '../../services/catalogImport'
import { getErrorMessage } from '../../services/errors'
import {
  CATALOG_CAPABILITIES,
  CATALOG_SOURCE_KINDS,
  CATALOG_SOURCE_MODES,
  type CatalogCapability,
  type CatalogSource,
} from '../../types'
import { formatDateTime } from '../../utils/format'

/** "search, vin , foo" → ['search', 'vin'] (unknown values dropped). */
function toCapabilities(value: unknown): CatalogCapability[] {
  const list = String(value ?? '')
    .split(/[\s,;]+/)
    .map((v) => v.trim().toLowerCase())
  return CATALOG_CAPABILITIES.filter((c) => list.includes(c))
}

/** /admin/catalog/providers — catalogue sources: enable/disable, priorities, defaults, sync. */
export function AdminCatalogProvidersPage() {
  const { t, lang } = useI18n()
  const sources = useAsync(listCatalogSources, [])
  const suppliers = useAsync(listSuppliers, [])
  const status = useAsync(getExternalCatalogStatus, [])
  const [syncing, setSyncing] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const p = t.adminProviders

  async function sync(source: CatalogSource) {
    setSyncing(source.id)
    setMessage(null)
    try {
      const result = await runSourceSync(source.key)
      setMessage({ tone: 'success', text: interpolate(p.syncDone, { result: JSON.stringify(result) }) })
      sources.reload()
    } catch (err) {
      setMessage({ tone: 'error', text: getErrorMessage(err, t) })
    } finally {
      setSyncing('')
    }
  }

  const fields: CrudField<CatalogSource>[] = [
    { key: 'name', label: t.adminCommon.name, required: true, maxLength: 120, column: true },
    { key: 'key', label: p.key, hint: p.keyHint, required: true, maxLength: 40, column: true },
    {
      key: 'kind',
      label: p.kind,
      type: 'select',
      required: true,
      initial: 'file',
      column: true,
      options: CATALOG_SOURCE_KINDS.map((k) => ({ value: k, label: p.kinds[k] })),
    },
    {
      key: 'mode',
      label: p.mode,
      type: 'select',
      required: true,
      initial: 'import',
      column: true,
      options: CATALOG_SOURCE_MODES.map((m) => ({ value: m, label: p.modes[m] })),
    },
    { key: 'enabled', label: p.enabled, type: 'checkbox', initial: false, column: true },
    { key: 'priority', label: p.priority, type: 'number', initial: '0' },
    { key: 'adapter', label: p.adapter, hint: p.adapterHint, maxLength: 40, showIf: (d) => d.kind !== 'file' },
    { key: 'capabilities', label: p.capabilities, hint: p.capabilitiesHint, maxLength: 200 },
    {
      key: 'supplier_id',
      label: p.supplier,
      type: 'select',
      options: (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: 'default_condition',
      label: p.defaultCondition,
      type: 'select',
      options: [
        { value: 'new', label: t.condition.new },
        { value: 'used', label: t.condition.used },
      ],
    },
    { key: 'default_currency', label: p.defaultCurrency, maxLength: 3 },
    { key: 'image_license', label: p.imageLicense, hint: p.imageLicenseHint, maxLength: 200 },
    { key: 'cache_ttl_minutes', label: p.cacheTtl, type: 'number', initial: '1440', showIf: (d) => d.mode !== 'import' },
    { key: 'notes', label: p.notes, type: 'textarea', maxLength: 2000 },
    {
      key: 'last_sync_at',
      label: p.lastSync,
      displayOnly: true,
      column: true,
      render: (s) => (
        <span className="small" title={s.last_sync_message ?? undefined}>
          {s.last_sync_at ? formatDateTime(s.last_sync_at, lang) : p.never}
          {s.last_sync_status && ` · ${s.last_sync_status}`}
        </span>
      ),
    },
  ]

  if (sources.error !== undefined) {
    return (
      <>
        <h1>{t.adminNav.catalogProviders}</h1>
        <Alert tone={isMigrationMissing(sources.error) ? 'warning' : 'error'}>
          {isMigrationMissing(sources.error) ? t.adminImport.migrationMissing : getErrorMessage(sources.error, t)}
        </Alert>
      </>
    )
  }
  if (!sources.data) return <Spinner />

  return (
    <>
      <h1>{t.adminNav.catalogProviders}</h1>
      <p className="muted">{p.intro}</p>

      <section className="card provider-status">
        <h2 className="card-title">{p.status}</h2>
        {status.loading && !status.data ? (
          <Spinner />
        ) : status.data && !status.data.deployed ? (
          <p className="muted">{p.statusNotDeployed}</p>
        ) : status.data && !status.data.configured ? (
          <p className="muted">{p.statusNotConfigured}</p>
        ) : status.data ? (
          <p>
            {interpolate(p.statusConfigured, {
              provider: status.data.provider ?? '',
              capabilities: status.data.capabilities.join(', '),
            })}
          </p>
        ) : null}
        <p className="muted small">{p.credentialsText}</p>
        <div className="code-block">
          {'supabase secrets set CATALOG_PROVIDER=<adaptador> CATALOG_API_URL=<url> CATALOG_API_KEY=<chave>\nsupabase functions deploy catalog-external\nsupabase functions deploy catalog-sync'}
        </div>
      </section>

      {message && (
        <div className="mt">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <div className="mt">
        <CrudManager
          title={p.sources}
          rows={sources.data}
          fields={fields}
          onSave={(row, id) =>
            saveCatalogSource(
              {
                ...row,
                capabilities: toCapabilities(row.capabilities),
                default_currency: row.default_currency ? String(row.default_currency).toUpperCase() : null,
              },
              id,
            )
          }
          onDelete={deleteCatalogSource}
          onChanged={sources.reload}
          actions={(s) =>
            s.kind !== 'file' && s.capabilities.includes('sync') ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!s.enabled || syncing !== ''}
                onClick={() => sync(s)}
              >
                {syncing === s.id ? '…' : p.syncNow}
              </button>
            ) : null
          }
        />
      </div>
    </>
  )
}
