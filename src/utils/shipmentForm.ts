import type { PartyField, PartyValues } from '../components/PartyFieldset'
import type { Dictionary } from '../i18n'
import type { ShipmentInput } from '../types'
import { isValidPhone } from './validation'

// Shared by the customer form (NewShipmentPage) and the admin shipment form.
export const EMPTY_PARTY: PartyValues = { name: '', phone: '', country: '', city: '', address: '' }

export interface FormState {
  sender: PartyValues
  recipient: PartyValues
  description: string
  weight: string
  notes: string
}

export type PartyErrors = Partial<Record<PartyField, string>>
export interface FormErrors {
  sender: PartyErrors
  recipient: PartyErrors
  description?: string
  weight?: string
}

export const INITIAL: FormState = {
  sender: EMPTY_PARTY,
  recipient: EMPTY_PARTY,
  description: '',
  weight: '',
  notes: '',
}

// Limits mirror the CHECK constraints in the database migration.
export function validateParty(values: PartyValues, t: Dictionary): PartyErrors {
  const errors: PartyErrors = {}
  if (values.name.trim().length < 2) errors.name = t.common.required
  if (!isValidPhone(values.phone)) errors.phone = t.shipmentForm.phoneInvalid
  if (!values.country) errors.country = t.common.required
  if (values.city.trim().length < 2) errors.city = t.common.required
  if (values.address.trim().length < 5)
    errors.address = values.address.trim() ? t.shipmentForm.tooShort : t.common.required
  return errors
}

export function parseWeight(value: string): number {
  return Number(value.replace(',', '.'))
}

export function validate(form: FormState, t: Dictionary): FormErrors {
  const weight = parseWeight(form.weight)
  return {
    sender: validateParty(form.sender, t),
    recipient: validateParty(form.recipient, t),
    description: form.description.trim().length < 3 ? t.common.required : undefined,
    weight: Number.isFinite(weight) && weight >= 0.01 && weight <= 1000 ? undefined : t.shipmentForm.weightInvalid,
  }
}

export function hasErrors(errors: FormErrors): boolean {
  return (
    Object.keys(errors.sender).length > 0 ||
    Object.keys(errors.recipient).length > 0 ||
    Boolean(errors.description || errors.weight)
  )
}

export function toInput(form: FormState): ShipmentInput {
  return {
    sender_name: form.sender.name.trim(),
    sender_phone: form.sender.phone.trim(),
    sender_country: form.sender.country,
    sender_city: form.sender.city.trim(),
    sender_address: form.sender.address.trim(),
    recipient_name: form.recipient.name.trim(),
    recipient_phone: form.recipient.phone.trim(),
    recipient_country: form.recipient.country,
    recipient_city: form.recipient.city.trim(),
    recipient_address: form.recipient.address.trim(),
    package_description: form.description.trim(),
    package_weight: Math.round(parseWeight(form.weight) * 100) / 100,
    notes: form.notes.trim() || null,
  }
}
