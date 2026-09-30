import { useI18n } from '../i18n/context'
import type { Shipment } from '../types'
import { countryName, formatDateTime, formatMoney } from '../utils/format'

/** Full shipment data (sender, recipient, package). Only rendered for the owner or an admin. */
export function ShipmentDetails({ shipment }: { shipment: Shipment }) {
  const { t, lang } = useI18n()

  const party = (prefix: 'sender' | 'recipient') => (
    <dl className="detail-list">
      <dt>{t.shipmentForm.name}</dt>
      <dd>{shipment[`${prefix}_name`]}</dd>
      <dt>{t.shipmentForm.phone}</dt>
      <dd>{shipment[`${prefix}_phone`]}</dd>
      <dt>{t.shipmentForm.address}</dt>
      <dd>
        {shipment[`${prefix}_address`]}
        <br />
        {shipment[`${prefix}_city`]}, {countryName(shipment[`${prefix}_country`], lang)}
      </dd>
    </dl>
  )

  return (
    <div className="grid grid-2">
      <section className="card">
        <h2 className="card-title">{t.shipmentForm.sender}</h2>
        {party('sender')}
      </section>
      <section className="card">
        <h2 className="card-title">{t.shipmentForm.recipient}</h2>
        {party('recipient')}
      </section>
      <section className="card">
        <h2 className="card-title">{t.shipmentForm.package}</h2>
        <dl className="detail-list">
          <dt>{t.shipmentForm.description}</dt>
          <dd>{shipment.package_description}</dd>
          <dt>{t.shipment.weight}</dt>
          <dd>{shipment.package_weight} kg</dd>
          {shipment.notes && (
            <>
              <dt>{t.shipmentForm.notes}</dt>
              <dd>{shipment.notes}</dd>
            </>
          )}
          <dt>{t.shipment.createdAt}</dt>
          <dd>{formatDateTime(shipment.created_at, lang)}</dd>
          <dt>{t.shipment.trackingFee}</dt>
          <dd>
            {shipment.tracking_fee_waived && !shipment.tracking_fee_paid ? (
              t.shipment.feeWaived
            ) : (
              <>
                {formatMoney(shipment.tracking_fee, 'EUR', lang)} ·{' '}
                {shipment.tracking_fee_paid ? t.shipment.feePaid : t.shipment.feeNotPaid}
              </>
            )}
          </dd>
        </dl>
      </section>
    </div>
  )
}
