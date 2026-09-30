import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { Field } from '../components/Field'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n/context'
import { updatePassword } from '../services/auth'
import { getErrorMessage } from '../services/errors'
import { MIN_PASSWORD_LENGTH } from '../utils/validation'

/** Target of the recovery email link: Supabase opens a temporary session from the URL. */
export function ResetPasswordPage() {
  const { t } = useI18n()
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = {
      password: password.length >= MIN_PASSWORD_LENGTH ? undefined : t.auth.passwordTooShort,
      confirm: confirm === password ? undefined : t.auth.passwordMismatch,
    }
    setErrors(nextErrors)
    if (nextErrors.password || nextErrors.confirm) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await updatePassword(password)
      setDone(true)
    } catch (error) {
      setSubmitError(getErrorMessage(error, t))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{t.auth.resetTitle}</h1>
        {done ? (
          <div className="stack">
            <Alert tone="success">{t.auth.passwordUpdated}</Alert>
            <Link to="/dashboard" className="btn btn-primary btn-block">
              {t.nav.dashboard}
            </Link>
          </div>
        ) : !session ? (
          <div className="stack">
            <Alert tone="error">{t.auth.resetLinkInvalid}</Alert>
            <Link to="/forgot-password">{t.auth.forgotTitle}</Link>
          </div>
        ) : (
          <form className="form" onSubmit={handleSubmit} noValidate>
            {submitError && <Alert tone="error">{submitError}</Alert>}
            <Field label={t.auth.newPassword} htmlFor="password" error={errors.password}>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label={t.auth.confirmPassword} htmlFor="confirm" error={errors.confirm}>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? t.common.loading : t.auth.updatePassword}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
