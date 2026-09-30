import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { LANGUAGE_META, LANGUAGES } from '../i18n'
import { useI18n } from '../i18n/context'
import { Flag } from './Flag'
import { Icon } from './Icon'

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    rootRef.current?.querySelector<HTMLButtonElement>('.lang-option[aria-current="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Arrow keys / Home / End move between options.
  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.lang-option')]
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    const moves: Record<string, number> = {
      ArrowDown: (index + 1) % options.length,
      ArrowUp: (index - 1 + options.length) % options.length,
      Home: 0,
      End: options.length - 1,
    }
    if (event.key in moves) {
      event.preventDefault()
      options[moves[event.key]]?.focus()
    }
  }

  return (
    // Clicks stay inside so the mobile menu does not close while choosing.
    <div className={`lang-menu${open ? ' open' : ''}`} ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button
        ref={toggleRef}
        type="button"
        className="lang-menu-toggle"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t.nav.language}: ${LANGUAGE_META[lang].name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Flag code={lang} />
        <span className="lang-menu-code">{lang.toUpperCase()}</span>
        <Icon name="chevronDown" size={16} />
      </button>

      <ul
        id={listId}
        className="lang-menu-list"
        hidden={!open}
        aria-label={t.nav.language}
        onKeyDown={handleListKeyDown}
      >
        {LANGUAGES.map((code) => (
          <li key={code}>
            <button
              type="button"
              className="lang-option"
              lang={code}
              aria-current={code === lang}
              onClick={() => {
                setLang(code)
                setOpen(false)
                toggleRef.current?.focus()
              }}
            >
              <Flag code={code} />
              <span>{LANGUAGE_META[code].name}</span>
              {code === lang && <Icon name="check" size={16} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
