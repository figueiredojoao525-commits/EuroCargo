import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { EventTimeline } from '../components/EventTimeline'
import { Spinner } from '../components/Spinner'
import { StatusBadge } from '../components/StatusBadge'
import { TrackingForm } from '../components/TrackingForm'
import { useI18n } from '../i18n/context'
import { getErrorMessage } from '../services/errors'
import { trackByCode } from '../services/tracking'
import type { TrackingResult } from '../types'
import { countryName, formatDateTime } from '../utils/format'
import { isValidTrackingCode, normalizeTrackingCode } from '../utils/validation'

type LookupState =
  | { code: string; status: 'loading' }
  | { code: string; status: 'found'; result: TrackingResult }
  | { code: string; status: 'not_found' }
  | { code: string; status: 'error'; error: unknown }

export function TrackPage() {
  const { t, lang } = useI18n()
  const [params] = useSearchParams()
  const code = normalizeTrackingCode(params.get('code') ?? '')
  const validCode = isValidTrackingCode(code)
  const [lookup, setLookup] = useState<LookupState | null>(null)

  useEffect(() => {
    if (!validCode) return
    let active = true
    trackByCode(code)
      .then((result) => {
        if (!active) return
        setLookup(result ? { code, status: 'found', result } : { code, status: 'not_found' })
      })
      .catch((error: unknown) => {
        if (active) setLookup({ code, status: 'error', error })
      })
    return () => {
      active = false
    }
  }, [code, validCode])

  // Results belong to a specific code; anything else means a lookup is in flight.
  const current: LookupState | null = !validCode ? null : lookup?.code === code ? lookup : { code, status: 'loading' }

  return (
    <div className="container page page-narrow">
      <h1>{t.tracking.title}</h1>
      <div className="card">
        <TrackingForm key={code} initialCode={code} />
      </div>

      <div className="stack mt">
        {code && !validCode && <Alert tone="error">{t.tracking.invalidFormat}</Alert>}
        {current?.status === 'loading' && <Spinner />}
        {current?.status === 'not_found' && <Alert tone="warning">{t.tracking.notFound}</Alert>}
        {current?.status === 'error' && <Alert tone="error">{getErrorMessage(current.error, t)}</Alert>}
        {current?.status === 'found' && (
          <>
            <section className="card">
              <dl className="detail-list">
                <dt>{t.tracking.code}</dt>
                <dd className="tracking-code-display">{current.result.tracking_code}</dd>
                <dt>{t.tracking.status}</dt>
                <dd>
                  <StatusBadge status={current.result.status} />
                </dd>
                {current.result.recipient_display && (
                  <>
                    <dt>{t.tracking.recipient}</dt>
                    <dd>{current.result.recipient_display}</dd>
                  </>
                )}
                <dt>{t.tracking.origin}</dt>
                <dd>
                  {current.result.origin_city}, {countryName(current.result.origin_country, lang)}
                </dd>
                <dt>{t.tracking.destination}</dt>
                <dd>
                  {current.result.destination_city}, {countryName(current.result.destination_country, lang)}
                </dd>
                <dt>{t.tracking.lastUpdate}</dt>
                <dd>{formatDateTime(current.result.last_update, lang)}</dd>
              </dl>
            </section>
            <section className="card">
              <h2 className="card-title">{t.tracking.history}</h2>
              <EventTimeline events={current.result.events} currentStatus={current.result.status} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
