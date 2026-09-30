import { useState, type FormEvent, type ReactNode } from 'react'
import { LANGUAGES, LANGUAGE_META } from '../../i18n'
import { useI18n } from '../../i18n/context'
import { getErrorMessage } from '../../services/errors'
import { Alert } from '../Alert'
import { CountrySelect } from '../CountrySelect'
import { Field } from '../Field'
import { Icon } from '../Icon'

type Value = string | boolean
export type Draft = Record<string, Value>

export interface CrudField<T> {
  key: keyof T & string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'email' | 'url' | 'country' | 'i18n'
  options?: { value: string; label: string }[]
  required?: boolean
  hint?: string
  maxLength?: number
  step?: string
  /** Shown as a table column (with an optional custom cell). */
  column?: boolean
  render?: (row: T) => ReactNode
  /** Hide the input unless the draft matches (e.g. rule scope). */
  showIf?: (draft: Draft) => boolean
  /** Value used for new records. */
  initial?: Value
  /** Table column only: never in the form and never sent on save. */
  displayOnly?: boolean
}

interface Props<T extends { id: string }> {
  title: string
  rows: T[]
  fields: CrudField<T>[]
  onSave: (row: Record<string, unknown>, id?: string) => Promise<unknown>
  onDelete?: (id: string) => Promise<void>
  onChanged: () => void
  /** Extra per-row actions (e.g. link to details). */
  actions?: (row: T) => ReactNode
  emptyText?: string
}

const TRANSLATED = LANGUAGES.filter((lang) => lang !== 'pt')

function toDraft<T>(fields: CrudField<T>[], row?: T): Draft {
  const draft: Draft = {}
  for (const field of fields) {
    if (field.displayOnly) continue
    const value = row ? (row as Record<string, unknown>)[field.key] : undefined
    if (field.type === 'checkbox') draft[field.key] = row ? Boolean(value) : Boolean(field.initial ?? false)
    else if (field.type === 'i18n') {
      const obj = (value ?? {}) as Record<string, string>
      for (const lang of TRANSLATED) draft[`${field.key}.${lang}`] = obj[lang] ?? ''
    } else draft[field.key] = value === null || value === undefined ? String(field.initial ?? '') : String(value)
  }
  return draft
}

function fromDraft<T>(fields: CrudField<T>[], draft: Draft): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.displayOnly) continue
    if (field.showIf && !field.showIf(draft)) {
      row[field.key] = field.type === 'checkbox' ? false : null
      continue
    }
    const value = draft[field.key]
    switch (field.type) {
      case 'checkbox':
        row[field.key] = Boolean(value)
        break
      case 'number':
        row[field.key] = value === '' ? null : Number(String(value).replace(',', '.'))
        break
      case 'i18n': {
        const obj: Record<string, string> = {}
        for (const lang of TRANSLATED) {
          const text = String(draft[`${field.key}.${lang}`] ?? '').trim()
          if (text) obj[lang] = text
        }
        row[field.key] = obj
        break
      }
      default: {
        const text = String(value ?? '').trim()
        row[field.key] = text === '' ? null : text
      }
    }
  }
  return row
}

/** Generic admin table + form for simple records. */
export function CrudManager<T extends { id: string }>({
  title,
  rows,
  fields,
  onSave,
  onDelete,
  onChanged,
  actions,
  emptyText,
}: Props<T>) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const columns = fields.filter((f) => f.column)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const missing = fields.find(
      (f) =>
        !f.displayOnly &&
        f.required &&
        (!f.showIf || f.showIf(editing.draft)) &&
        String(editing.draft[f.key] ?? '').trim() === '',
    )
    if (missing) {
      setError(`${missing.label}: ${t.common.required}`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(fromDraft(fields, editing.draft), editing.id)
      setEditing(null)
      setNotice(t.adminCommon.saved)
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!onDelete) return
    setError('')
    try {
      await onDelete(id)
      setConfirmDelete(null)
      setNotice(t.adminCommon.deleted)
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err, t))
      setConfirmDelete(null)
    }
  }

  const set = (key: string, value: Value) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, [key]: value } } : e))

  function renderInput(field: CrudField<T>, draft: Draft) {
    const id = `crud-${field.key}`
    const value = draft[field.key]
    switch (field.type) {
      case 'checkbox':
        return (
          <label className="checkbox" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => set(field.key, e.target.checked)}
            />
            {field.label}
          </label>
        )
      case 'textarea':
        return (
          <Field label={field.label} htmlFor={id} hint={field.hint}>
            <textarea
              id={id}
              maxLength={field.maxLength}
              value={String(value)}
              onChange={(e) => set(field.key, e.target.value)}
            />
          </Field>
        )
      case 'select':
        return (
          <Field label={field.label} htmlFor={id} hint={field.hint}>
            <select id={id} value={String(value)} onChange={(e) => set(field.key, e.target.value)}>
              {!field.required && <option value="">{t.common.none}</option>}
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        )
      case 'country':
        return (
          <Field label={field.label} htmlFor={id} hint={field.hint}>
            <CountrySelect
              id={id}
              value={String(value)}
              placeholder={t.common.none}
              onChange={(e) => set(field.key, e.target.value)}
            />
          </Field>
        )
      case 'i18n':
        return (
          <fieldset className="i18n-fieldset">
            <legend>{field.label}</legend>
            <div className="form-grid">
              {TRANSLATED.map((lang) => (
                <Field key={lang} label={LANGUAGE_META[lang].name} htmlFor={`${id}-${lang}`}>
                  <input
                    id={`${id}-${lang}`}
                    lang={lang}
                    maxLength={field.maxLength}
                    value={String(draft[`${field.key}.${lang}`] ?? '')}
                    onChange={(e) => set(`${field.key}.${lang}`, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        )
      default:
        return (
          <Field label={field.required ? `${field.label} *` : field.label} htmlFor={id} hint={field.hint}>
            <input
              id={id}
              type={field.type === 'number' ? 'text' : (field.type ?? 'text')}
              inputMode={field.type === 'number' ? 'decimal' : undefined}
              maxLength={field.maxLength}
              value={String(value)}
              onChange={(e) => set(field.key, e.target.value)}
            />
          </Field>
        )
    }
  }

  return (
    <section className="crud">
      <div className="page-header">
        <h2>{title}</h2>
        {!editing && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setNotice('')
              setEditing({ draft: toDraft(fields) })
            }}
          >
            <Icon name="plus" size={16} />
            {t.adminCommon.add}
          </button>
        )}
      </div>

      {notice && !editing && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {editing && (
        <form className="card form crud-form" onSubmit={handleSubmit} noValidate>
          <h3>{editing.id ? t.adminCommon.edit : t.adminCommon.add}</h3>
          <div className="form-grid">
            {fields
              .filter((f) => !f.displayOnly && (!f.showIf || f.showIf(editing.draft)))
              .map((field) => (
                <div key={field.key} className={field.type === 'textarea' || field.type === 'i18n' ? 'span-2' : ''}>
                  {renderInput(field, editing.draft)}
                </div>
              ))}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t.common.loading : t.adminCommon.save}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(null)
                setError('')
              }}
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="card empty">{emptyText ?? t.adminCommon.empty}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>
                  <span className="sr-only">{t.adminCommon.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => {
                    const raw = (row as Record<string, unknown>)[c.key]
                    return (
                      <td key={c.key}>
                        {c.render
                          ? c.render(row)
                          : c.type === 'checkbox'
                            ? raw
                              ? t.adminCommon.yes
                              : t.adminCommon.no
                            : c.type === 'select'
                              ? (c.options?.find((o) => o.value === raw)?.label ?? t.common.none)
                              : raw === null || raw === undefined || raw === ''
                                ? t.common.none
                                : String(raw)}
                      </td>
                    )
                  })}
                  <td className="row-actions">
                    {actions?.(row)}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={t.adminCommon.edit}
                      onClick={() => {
                        setNotice('')
                        setEditing({ id: row.id, draft: toDraft(fields, row) })
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    {onDelete &&
                      (confirmDelete === row.id ? (
                        <>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(row.id)}>
                            {t.adminCommon.confirmDelete}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>
                            {t.common.cancel}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={t.adminCommon.delete}
                          onClick={() => setConfirmDelete(row.id)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
