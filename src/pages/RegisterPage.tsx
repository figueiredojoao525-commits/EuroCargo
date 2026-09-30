import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { CountrySelect } from '../components/CountrySelect'
import { Field } from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n/context'
import { signUp } from '../services/auth'
import { getErrorMessage } from '../services/errors'
import { MIN_PASSWORD_LENGTH, isValidEmail, isValidPhone } from '../utils/validation'

const EMPTY = { fullName: '', email: '', phone: '', country: '', password: '', confirm: '' }
type FormValues = typeof EMPTY

export function RegisterPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [values, setValues] = useState<FormValues>(EMPTY)
  const [errors, setErrors] = useState<Partial<FormValues>>({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  if (user && !submitting) return <Navigate to="/dashboard" replace />

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function validate(): Partial<FormValues> {
    const result: Partial<FormValues> = {}
    if (values.fullName.trim().length < 2) result.fullName = t.common.required
    if (!isValidEmail(values.email)) result.email = t.common.invalidEmail
    if (values.phone && !isValidPhone(values.phone)) result.phone = t.shipmentForm.phoneInvalid
    if (values.password.length < MIN_PASSWORD_LENGTH) result.password = t.auth.passwordTooShort
    if (values.confirm !== values.password) result.confirm = t.auth.passwordMismatch
    return result
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: values.phone,
        country: values.country,
      })
      if (result.needsConfirmation) {
        setNeedsConfirmation(true)
        setSubmitting(false)
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (error) {
      setSubmitError(getErrorMessage(error, t))
      setSubmitting(false)
    }
  }

  if (needsConfirmation) {
    return (
      <div className="auth-page">
        <div className="card auth-card stack">
          <h1>{t.auth.registerTitle}</h1>
          <Alert tone="success">{t.auth.checkEmail}</Alert>
          <Link to="/login" className="btn btn-primary btn-block">
            {t.nav.login}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{t.auth.registerTitle}</h1>
        <form className="form" onSubmit={handleSubmit} noValidate>
          {submitError && <Alert tone="error">{submitError}</Alert>}
          <Field label={t.auth.fullName} htmlFor="fullName" error={errors.fullName}>
            <input
              id="fullName"
              autoComplete="name"
              maxLength={120}
              value={values.fullName}
              onChange={(e) => update('fullName', e.target.value)}
            />
          </Field>
          <Field label={t.auth.email} htmlFor="email" error={errors.email}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </Field>
          <Field label={`${t.auth.phone} (${t.common.optional})`} htmlFor="phone" error={errors.phone}>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              value={values.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </Field>
          <Field label={`${t.auth.country} (${t.common.optional})`} htmlFor="country">
            <CountrySelect
              id="country"
              value={values.country}
              placeholder={t.shipmentForm.selectCountry}
              onChange={(e) => update('country', e.target.value)}
            />
          </Field>
          <Field label={t.auth.password} htmlFor="password" error={errors.password}>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={(e) => update('password', e.target.value)}
            />
          </Field>
          <Field label={t.auth.confirmPassword} htmlFor="confirm" error={errors.confirm}>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={values.confirm}
              onChange={(e) => update('confirm', e.target.value)}
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? t.common.loading : t.auth.submitRegister}
          </button>
          <div className="auth-links">
            <span>
              {t.auth.haveAccount} <Link to="/login">{t.nav.login}</Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
