import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { Field } from '../components/Field'
import { useI18n } from '../i18n/context'
import { sendPasswordReset } from '../services/auth'
import { getErrorMessage } from '../services/errors'
import { isValidEmail } from '../utils/validation'

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValidEmail(email)) {
      setError(t.common.invalidEmail)
      return
    }
    setError('')
    setSubmitError('')
    setSubmitting(true)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setSubmitError(getErrorMessage(err, t))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{t.auth.forgotTitle}</h1>
        {sent ? (
          <div className="stack">
            <Alert tone="success">{t.auth.resetSent}</Alert>
            <Link to="/login">{t.nav.login}</Link>
          </div>
        ) : (
          <form className="form" onSubmit={handleSubmit} noValidate>
            <p className="muted">{t.auth.forgotText}</p>
            {submitError && <Alert tone="error">{submitError}</Alert>}
            <Field label={t.auth.email} htmlFor="email" error={error}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? t.common.loading : t.auth.sendResetLink}
            </button>
            <div className="auth-links">
              <Link to="/login">{t.common.back}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
