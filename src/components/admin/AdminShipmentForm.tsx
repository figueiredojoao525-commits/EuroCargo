import { useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/context'
import { createShipmentAsAdmin } from '../../services/adminOrders'
import { getErrorMessage } from '../../services/errors'
import type { PartyValues } from '../PartyFieldset'
import { PartyFieldset, type PartyField, type PartyKey } from '../PartyFieldset'
import { EMPTY_PARTY, hasErrors, toInput, validate, type FormErrors, type FormState } from '../../utils/shipmentForm'
import { Alert } from '../Alert'
import { Field } from '../Field'

const SENDER_KEY = 'eurocargo_admin_sender'

/** Last sender used by this admin (convenience only; per browser). */
function storedSender(): PartyValues {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SENDER_KEY) ?? 'null')
    if (value && typeof value === 'object') return { ...EMPTY_PARTY, ...(value as Partial<PartyValues>) }
  } catch {
    // ignore
  }
  return EMPTY_PARTY
}

/** Admin creates a shipment (for a customer / order) and optionally issues the tracking code at once. */
export function AdminShipmentForm({
  recipient,
  description = '',
  customerId,
  orderId,
  onCreated,
}: {
  recipient?: Partial<PartyValues>
  description?: string
  customerId: string | null
  orderId: string | null
  onCreated: (result: { id: string; tracking_code: string | null }) => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<FormState>(() => ({
    sender: storedSender(),
    recipient: { ...EMPTY_PARTY, ...recipient },
    description,
    weight: '',
    notes: '',
  }))
  const [errors, setErrors] = useState<FormErrors>({ sender: {}, recipient: {} })
  const [generate, setGenerate] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function update(party: PartyKey, field: PartyField, value: string) {
    setForm((f) => ({ ...f, [party]: { ...f[party], [field]: value } }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next = validate(form, t)
    setErrors(next)
    if (hasErrors(next)) return
    setSaving(true)
    setError('')
    try {
      const result = await createShipmentAsAdmin(toInput(form), customerId, orderId, generate)
      try {
        localStorage.setItem(SENDER_KEY, JSON.stringify(form.sender))
      } catch {
        // ignore
      }
      onCreated(result)
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <PartyFieldset
        party="sender"
        values={form.sender}
        errors={errors.sender}
        onChange={(f, v) => update('sender', f, v)}
      />
      <PartyFieldset
        party="recipient"
        values={form.recipient}
        errors={errors.recipient}
        onChange={(f, v) => update('recipient', f, v)}
      />
      <fieldset className="card">
        <legend>{t.shipmentForm.package}</legend>
        <div className="form-grid">
          <div className="span-2">
            <Field label={t.shipmentForm.description} htmlFor="as-description" error={errors.description}>
              <input
                id="as-description"
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t.shipmentForm.weight} htmlFor="as-weight" error={errors.weight}>
            <input
              id="as-weight"
              inputMode="decimal"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
            />
          </Field>
          <div className="span-2">
            <Field label={`${t.shipmentForm.notes} (${t.common.optional})`} htmlFor="as-notes">
              <textarea
                id="as-notes"
                maxLength={1000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} />
          {t.adminShipments.generateNow}
        </label>
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
          {saving ? t.common.loading : t.adminShipments.create}
        </button>
      </div>
    </form>
  )
}
