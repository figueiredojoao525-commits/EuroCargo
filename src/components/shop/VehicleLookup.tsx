import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { catalogProvider } from '../../services/catalog'
import { getErrorMessage } from '../../services/errors'
import type { VehicleMatch } from '../../types'
import { Alert } from '../Alert'
import { Field } from '../Field'

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i

/**
 * Vehicle by VIN or licence plate. Shown only when a configured provider really
 * decodes them (capabilities 'vin' / 'plate'); otherwise just the hint text.
 */
export function VehicleLookup() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const capabilities = useAsync(() => catalogProvider.capabilities(), [])
  const [value, setValue] = useState('')
  const [matches, setMatches] = useState<VehicleMatch[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canVin = capabilities.data?.has('vin') ?? false
  const canPlate = capabilities.data?.has('plate') ?? false
  if (!canVin && !canPlate) return <p className="muted small">{t.vehicles.vinHint}</p>

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const input = value.trim().toUpperCase()
    if (!input) return
    setBusy(true)
    setError('')
    try {
      const result =
        canVin && VIN.test(input)
          ? await catalogProvider.searchByVIN(input)
          : canPlate
            ? await catalogProvider.searchByPlate(input, '')
            : { supported: false, vehicles: [] }
      setMatches(result.supported ? result.vehicles : [])
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  function open(match: VehicleMatch) {
    const params = new URLSearchParams()
    if (match.makeId) params.set('make', match.makeId)
    if (match.modelId) params.set('model', match.modelId)
    if (match.variantId) params.set('variant', match.variantId)
    if (match.year) params.set('year', String(match.year))
    navigate(`/pecas?${params.toString()}`)
  }

  return (
    <form className="vehicle-lookup" onSubmit={handleSubmit}>
      <Field label={canVin && canPlate ? t.vehicles.vinOrPlate : canVin ? t.vehicles.vin : t.vehicles.plate} htmlFor="lookup">
        <div className="input-row">
          <input id="lookup" value={value} maxLength={20} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="btn btn-outline" disabled={busy || !value.trim()}>
            {t.shop.searchButton}
          </button>
        </div>
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      {matches && matches.length === 0 && <Alert tone="info">{t.vehicles.lookupNone}</Alert>}
      {matches && matches.length > 0 && (
        <ul className="compat-list">
          {matches.map((m, i) => (
            <li key={i}>
              <button type="button" className="btn btn-ghost" disabled={!m.makeId} onClick={() => open(m)}>
                {[m.make, m.model, m.variant, m.year, m.engine_code].filter(Boolean).join(' · ')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
