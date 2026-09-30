import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { isValidTrackingCode, normalizeTrackingCode } from '../utils/validation'
import { Icon } from './Icon'

const EXAMPLE_TRACKING_CODE = 'EC-PT-2026-8F42K9'

export function TrackingForm({ initialCode = '' }: { initialCode?: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeTrackingCode(code)
    if (!isValidTrackingCode(normalized)) {
      setError(t.tracking.invalidFormat)
      return
    }
    setError('')
    navigate(`/rastrear?code=${encodeURIComponent(normalized)}`)
  }

  return (
    <form className="tracking-form" onSubmit={handleSubmit} noValidate>
      <div className="tracking-form-row">
        <label htmlFor="tracking-code" className="sr-only">
          {t.tracking.placeholder}
        </label>
        <input
          id="tracking-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t.tracking.placeholder}
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          aria-invalid={Boolean(error)}
          aria-describedby="tracking-help"
        />
        <button type="submit" className="btn btn-accent">
          <Icon name="search" size={18} />
          {t.tracking.submit}
        </button>
      </div>
      <small id="tracking-help" className={error ? 'field-error' : 'tracking-example'}>
        {error || (
          <>
            {t.tracking.example} <code>{EXAMPLE_TRACKING_CODE}</code>
          </>
        )}
      </small>
    </form>
  )
}
