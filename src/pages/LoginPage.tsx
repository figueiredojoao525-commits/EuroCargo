import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { Field } from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n/context'
import { signIn } from '../services/auth'
import { getErrorMessage } from '../services/errors'
import { isValidEmail } from '../utils/validation'

export function LoginPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user && !submitting) return <Navigate to={redirectTo} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = {
      email: isValidEmail(email) ? undefined : t.common.invalidEmail,
      password: password ? undefined : t.common.required,
    }
    setErrors(nextErrors)
    if (nextErrors.email || nextErrors.password) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await signIn(email, password)
      navigate(redirectTo, { replace: true })
    } catch (error) {
      setSubmitError(getErrorMessage(error, t))
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{t.auth.loginTitle}</h1>
        <form className="form" onSubmit={handleSubmit} noValidate>
          {submitError && <Alert tone="error">{submitError}</Alert>}
          <Field label={t.auth.email} htmlFor="email" error={errors.email}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t.auth.password} htmlFor="password" error={errors.password}>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? t.common.loading : t.auth.submitLogin}
          </button>
          <div className="auth-links">
            <Link to="/forgot-password">{t.auth.forgotLink}</Link>
            <span>
              {t.auth.noAccount} <Link to="/register">{t.nav.register}</Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
