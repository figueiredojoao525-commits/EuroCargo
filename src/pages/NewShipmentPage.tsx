import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { Field } from '../components/Field'
import { PartyFieldset, type PartyField, type PartyKey } from '../components/PartyFieldset'
import { useI18n } from '../i18n/context'
import { getErrorMessage } from '../services/errors'
import { createShipment } from '../services/shipments'
import type { Shipment } from '../types'
import { hasErrors, INITIAL, toInput, validate, type FormErrors, type FormState } from '../utils/shipmentForm'

export function NewShipmentPage() {
  const { t } = useI18n()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [errors, setErrors] = useState<FormErrors>({ sender: {}, recipient: {} })
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<Shipment | null>(null)

  function updateParty(party: PartyKey, field: PartyField, value: string) {
    setForm((current) => ({ ...current, [party]: { ...current[party], [field]: value } }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate(form, t)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    setSubmitting(true)
    setSubmitError('')
    try {
      setCreated(await createShipment(toInput(form)))
      window.scrollTo(0, 0)
    } catch (error) {
      setSubmitError(getErrorMessage(error, t))
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="container page page-narrow">
        <div className="card stack">
          <Alert tone="success">
            <p>
              <strong>{t.shipmentForm.created}</strong>
            </p>
            <p>{t.shipmentForm.paymentHint}</p>
          </Alert>
          <Link to={`/shipments/${created.id}`} className="btn btn-primary">
            {t.shipmentForm.goToShipment}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container page page-narrow">
      <h1>{t.shipmentForm.title}</h1>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {submitError && <Alert tone="error">{submitError}</Alert>}

        <PartyFieldset
          party="sender"
          values={form.sender}
          errors={errors.sender}
          onChange={(field, value) => updateParty('sender', field, value)}
        />
        <PartyFieldset
          party="recipient"
          values={form.recipient}
          errors={errors.recipient}
          onChange={(field, value) => updateParty('recipient', field, value)}
        />

        <fieldset className="card">
          <legend>{t.shipmentForm.package}</legend>
          <div className="form-grid">
            <div className="span-2">
              <Field label={t.shipmentForm.description} htmlFor="description" error={errors.description}>
                <input
                  id="description"
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t.shipmentForm.weight} htmlFor="weight" error={errors.weight}>
              <input
                id="weight"
                inputMode="decimal"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </Field>
            <div className="span-2">
              <Field label={`${t.shipmentForm.notes} (${t.common.optional})`} htmlFor="notes">
                <textarea
                  id="notes"
                  maxLength={1000}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? t.shipmentForm.submitting : t.shipmentForm.submit}
          </button>
        </div>
      </form>
    </div>
  )
}
