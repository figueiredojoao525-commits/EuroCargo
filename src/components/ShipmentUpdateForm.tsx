import { useState, type FormEvent } from 'react'
import { interpolate } from '../i18n'
import { useI18n } from '../i18n/context'
import { addShipmentEvent } from '../services/admin'
import { getErrorMessage } from '../services/errors'
import { SHIPMENT_STATUSES, type Shipment, type ShipmentStatus } from '../types'
import { SYSTEM_STATUSES } from '../utils/status'
import { Alert } from './Alert'
import { Field } from './Field'

interface Props {
  shipment: Shipment
  onSaved: () => void
}

/** Admin form: change status and/or add a location/description event, with an inline confirmation step. */
export function ShipmentUpdateForm({ shipment, onSaved }: Props) {
  const { t } = useI18n()
  const [status, setStatus] = useState<ShipmentStatus>(shipment.status)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  // Local date-time of the event; empty = now.
  const [occurredAt, setOccurredAt] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const statusChanged = status !== shipment.status

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    if (!statusChanged && !location.trim() && !description.trim()) {
      setError(t.admin.update.empty)
      return
    }
    setError('')
    setConfirming(true)
  }

  async function handleConfirm() {
    setSaving(true)
    setError('')
    try {
      await addShipmentEvent(
        shipment.id,
        status,
        location,
        description,
        occurredAt ? new Date(occurredAt).toISOString() : undefined,
      )
      setLocation('')
      setDescription('')
      setOccurredAt('')
      setConfirming(false)
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err, t))
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {saved && <Alert tone="success">{t.admin.update.saved}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Field label={t.admin.update.status} htmlFor="u-status">
        <select
          id="u-status"
          value={status}
          disabled={confirming}
          onChange={(e) => setStatus(e.target.value as ShipmentStatus)}
        >
          {SHIPMENT_STATUSES.map((value) => (
            <option
              key={value}
              value={value}
              // Payment-related statuses are set only by the payment flow.
              disabled={value !== shipment.status && SYSTEM_STATUSES.includes(value)}
            >
              {t.status[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.admin.update.occurredAt} htmlFor="u-occurred" hint={t.admin.update.occurredAtHint}>
        <input
          id="u-occurred"
          type="datetime-local"
          value={occurredAt}
          disabled={confirming}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </Field>
      <Field label={t.admin.update.location} htmlFor="u-location">
        <input
          id="u-location"
          maxLength={150}
          value={location}
          disabled={confirming}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>
      <Field label={t.admin.update.description} htmlFor="u-description" hint={t.admin.update.descriptionHint}>
        <textarea
          id="u-description"
          maxLength={500}
          value={description}
          disabled={confirming}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {confirming ? (
        <div className="confirm-box">
          <p>
            {statusChanged
              ? interpolate(t.admin.update.confirmStatus, {
                  from: t.status[shipment.status],
                  to: t.status[status],
                })
              : t.admin.update.confirmEvent}
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
              {saving ? t.common.loading : t.common.confirm}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={saving}>
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            {t.admin.update.submit}
          </button>
        </div>
      )}
    </form>
  )
}
