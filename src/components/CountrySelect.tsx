import type { SelectHTMLAttributes } from 'react'
import { useI18n } from '../i18n/context'
import { SUPPORTED_COUNTRIES } from '../utils/countries'
import { countryName } from '../utils/format'

type Props = SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }

export function CountrySelect({ placeholder = '', ...props }: Props) {
  const { lang } = useI18n()
  return (
    <select {...props}>
      <option value="">{placeholder}</option>
      {SUPPORTED_COUNTRIES.map((code) => (
        <option key={code} value={code}>
          {countryName(code, lang)}
        </option>
      ))}
    </select>
  )
}
