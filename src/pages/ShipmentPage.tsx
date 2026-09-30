import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { EventTimeline } from '../components/EventTimeline'
import { Icon } from '../components/Icon'
import { PaymentsTable } from '../components/PaymentsTable'
import { ShipmentDetails } from '../components/ShipmentDetails'
import { Spinner } from '../components/Spinner'
import { StatusBadge } from '../components/StatusBadge'
import { useAsync } from '../hooks/useAsync'
import { useI18n } from '../i18n/context'
import { getErrorMessage } from '../services/errors'
import { startTrackingPayment } from '../services/payments'
import { getShipmentBundle } from '../services/shipments'

/** Customer view of one of their shipments (RLS hides other users' shipments). */
export function ShipmentPage() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const { data, error, loading, reload } = useAsync(() => getShipmentBundle(id), [id])
  const [requesting, setRequesting] = useState(false)
  const [paymentError, setPaymentError] = useState<Error | null>(null)

  async function handleRequestTracking() {
    setRequesting(true)
    setPaymentError(null)
    try {
      const checkoutUrl = await startTrackingPayment(id)
      window.location.assign(checkoutUrl)
    } catch (err) {
      setPaymentError(err as Error)
      setRequesting(false)
      reload() // the pending payment may have been created even if checkout failed
    }
  }

  if (loading && !data) return <Spinner />

  if (error !== undefined || !data) {
    return (
      <div className="container page page-narrow">
        <Alert tone="error">{error !== undefined ? getErrorMessage(error, t) : t.shipment.notFound}</Alert>
      </div>
    )
  }

  const { shipment, events, payments } = data
  const providerMissing = paymentError?.message === 'payment_provider_not_configured'

  return (
    <div className="container page">
      <Link to="/dashboard" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.common.back}
      </Link>
      <div className="page-header">
        <h1>
          {t.shipment.title} {shipment.sender_city} → {shipment.recipient_city}
        </h1>
        <StatusBadge status={shipment.status} />
      </div>

      <div className="stack">
        <section className="card">
          <h2 className="card-title">{t.shipment.requestTitle}</h2>
          {shipment.tracking_code ? (
            <div className="form-actions">
              <span className="tracking-code-display">{shipment.tracking_code}</span>
              <Link to={`/rastrear?code=${shipment.tracking_code}`} className="btn btn-outline btn-sm">
                {t.shipment.viewTracking}
              </Link>
            </div>
          ) : shipment.status === 'cancelled' ? (
            <Alert tone="warning">{t.shipment.cancelledShipment}</Alert>
          ) : (
            <div className="stack">
              <p className="muted">{t.shipment.requestText}</p>
              {paymentError && (
                <Alert tone={providerMissing ? 'warning' : 'error'}>{getErrorMessage(paymentError, t)}</Alert>
              )}
              <div>
                <button type="button" className="btn btn-accent" onClick={handleRequestTracking} disabled={requesting}>
                  {requesting ? t.shipment.requesting : t.shipment.requestButton}
                </button>
              </div>
            </div>
          )}
        </section>

        <ShipmentDetails shipment={shipment} />

        <section className="card">
          <h2 className="card-title">{t.shipment.history}</h2>
          <EventTimeline events={events} currentStatus={shipment.status} />
        </section>

        <section className="card">
          <h2 className="card-title">{t.shipment.payments}</h2>
          <PaymentsTable payments={payments} />
        </section>
      </div>
    </div>
  )
}
