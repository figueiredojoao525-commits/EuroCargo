import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { Spinner } from '../components/Spinner'
import { useI18n } from '../i18n/context'
import { getShipment } from '../services/shipments'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 10

/**
 * Landing page after the payment provider redirects back.
 * Reaching this page does NOT mean the payment is confirmed: we only wait for
 * the webhook-driven tracking code to appear in the database.
 */
export function PaymentReturnPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const shipmentId = params.get('shipment') ?? ''
  const cancelled = params.get('status') !== 'success'
  const [result, setResult] = useState<{ code: string | null; done: boolean }>({ code: null, done: false })

  useEffect(() => {
    if (cancelled || !shipmentId) return
    let active = true
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      attempts++
      const shipment = await getShipment(shipmentId).catch(() => null)
      if (!active) return
      if (shipment?.tracking_code) {
        setResult({ code: shipment.tracking_code, done: true })
      } else if (attempts >= MAX_ATTEMPTS) {
        setResult({ code: null, done: true })
      } else {
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }
    void poll()

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [cancelled, shipmentId])

  return (
    <div className="container page page-narrow">
      <h1>{t.payment.returnTitle}</h1>
      <div className="card stack">
        {cancelled ? (
          <Alert tone="warning">{t.payment.cancelled}</Alert>
        ) : !result.done ? (
          <>
            <Alert tone="info">{t.payment.processing}</Alert>
            <Spinner />
          </>
        ) : result.code ? (
          <>
            <Alert tone="success">{t.payment.confirmed}</Alert>
            <p className="tracking-code-display center">{result.code}</p>
          </>
        ) : (
          <Alert tone="info">{t.payment.stillPending}</Alert>
        )}
        {shipmentId && (
          <Link to={`/shipments/${shipmentId}`} className="btn btn-primary">
            {t.payment.backToShipment}
          </Link>
        )}
      </div>
    </div>
  )
}
