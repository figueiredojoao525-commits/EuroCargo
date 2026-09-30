import { useI18n } from '../i18n/context'
import { CountrySelect } from './CountrySelect'
import { Field } from './Field'

export type PartyKey = 'sender' | 'recipient'
export type PartyField = 'name' | 'phone' | 'country' | 'city' | 'address'
export type PartyValues = Record<PartyField, string>

interface Props {
  party: PartyKey
  values: PartyValues
  errors: Partial<Record<PartyField, string>>
  onChange: (field: PartyField, value: string) => void
}

/** Name / phone / country / city / address block, shared by sender and recipient. */
export function PartyFieldset({ party, values, errors, onChange }: Props) {
  const { t } = useI18n()
  const id = (field: PartyField) => `${party}-${field}`

  return (
    <fieldset className="card">
      <legend>{party === 'sender' ? t.shipmentForm.sender : t.shipmentForm.recipient}</legend>
      <div className="form-grid">
        <Field label={t.shipmentForm.name} htmlFor={id('name')} error={errors.name}>
          <input
            id={id('name')}
            maxLength={120}
            autoComplete={party === 'sender' ? 'name' : 'off'}
            value={values.name}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </Field>
        <Field label={t.shipmentForm.phone} htmlFor={id('phone')} error={errors.phone}>
          <input
            id={id('phone')}
            type="tel"
            maxLength={30}
            autoComplete={party === 'sender' ? 'tel' : 'off'}
            value={values.phone}
            onChange={(e) => onChange('phone', e.target.value)}
          />
        </Field>
        <Field label={t.shipmentForm.country} htmlFor={id('country')} error={errors.country}>
          <CountrySelect
            id={id('country')}
            value={values.country}
            placeholder={t.shipmentForm.selectCountry}
            onChange={(e) => onChange('country', e.target.value)}
          />
        </Field>
        <Field label={t.shipmentForm.city} htmlFor={id('city')} error={errors.city}>
          <input
            id={id('city')}
            maxLength={100}
            value={values.city}
            onChange={(e) => onChange('city', e.target.value)}
          />
        </Field>
        <div className="span-2">
          <Field label={t.shipmentForm.address} htmlFor={id('address')} error={errors.address}>
            <input
              id={id('address')}
              maxLength={250}
              value={values.address}
              onChange={(e) => onChange('address', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </fieldset>
  )
}
