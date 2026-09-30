import { Link, useParams } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { TrackingCodeTools } from '../../components/admin/TrackingCodeTools'
import { EventTimeline } from '../../components/EventTimeline'
import { Icon } from '../../components/Icon'
import { PaymentsTable } from '../../components/PaymentsTable'
import { ShipmentDetails } from '../../components/ShipmentDetails'
import { ShipmentUpdateForm } from '../../components/ShipmentUpdateForm'
import { Spinner } from '../../components/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { getErrorMessage } from '../../services/errors'
import { getShipmentBundle } from '../../services/shipments'

export function AdminShipmentPage() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const { data, error, loading, reload } = useAsync(() => getShipmentBundle(id), [id])

  if (loading && !data) return <Spinner />
  if (error !== undefined || !data) {
    return <Alert tone="error">{error !== undefined ? getErrorMessage(error, t) : t.shipment.notFound}</Alert>
  }

  const { shipment, events, payments } = data

  return (
    <>
      <Link to="/admin" className="back-link">
        <Icon name="arrowLeft" size={18} />
        {t.common.back}
      </Link>
      <div className="page-header">
        <div>
          <p className="muted eyebrow">{t.shipment.trackingCode}</p>
          <h1 className="mono">{shipment.tracking_code ?? t.shipment.noTrackingYet}</h1>
        </div>
        <StatusBadge status={shipment.status} />
      </div>

      <div className="stack">
        <section className="card">
          <h2 className="card-title">{t.shipment.trackingCode}</h2>
          <TrackingCodeTools
            shipmentId={shipment.id}
            code={shipment.tracking_code}
            recipientPhone={shipment.recipient_phone}
            onGenerated={reload}
          />
        </section>
        <div className="grid grid-2">
          <section className="card">
            <h2 className="card-title">{t.admin.update.title}</h2>
            <ShipmentUpdateForm key={shipment.id} shipment={shipment} onSaved={reload} />
          </section>
          <section className="card">
            <h2 className="card-title">{t.shipment.history}</h2>
            <EventTimeline events={events} currentStatus={shipment.status} />
          </section>
        </div>

        <ShipmentDetails shipment={shipment} />

        <section className="card">
          <h2 className="card-title">{t.shipment.payments}</h2>
          <PaymentsTable payments={payments} />
        </section>
      </div>
    </>
  )
}
