import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext } from './context'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_META,
  detectBrowserLanguage,
  dictionaries,
  isLanguage,
  matchLanguage,
  type Language,
} from './index'

/** Stores the language the user picked manually. Only written on an explicit choice. */
const STORAGE_KEY = 'eurocargo_language'
/** Key used by earlier versions; read once so existing choices are kept. */
const LEGACY_STORAGE_KEY = 'eurocargo.lang'

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    return isLanguage(stored) ? stored : null
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
    return null
  }
}

/** `?lang=xx` in the URL, so a language-specific link (e.g. future hreflang URLs) opens in that language. */
function readUrlLanguage(): Language | null {
  try {
    return matchLanguage(new URLSearchParams(window.location.search).get('lang'))
  } catch {
    return null
  }
}

/**
 * Priority: explicit `?lang=` link → language chosen manually before → browser
 * language → Portuguese.
 */
function resolveInitialLanguage(): Language {
  return readUrlLanguage() ?? readStoredLanguage() ?? detectBrowserLanguage() ?? DEFAULT_LANGUAGE
}

function setMeta(selector: string, content: string) {
  document.querySelector(selector)?.setAttribute('content', content)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(resolveInitialLanguage)

  // Keep <html lang>, the title and the basic SEO / social tags in sync with the language.
  useEffect(() => {
    const { meta } = dictionaries[lang]
    const ogLocale = LANGUAGE_META[lang].locale.replace('-', '_')
    document.documentElement.lang = lang
    document.title = meta.title
    setMeta('meta[name="description"]', meta.description)
    setMeta('meta[property="og:title"]', meta.title)
    setMeta('meta[property="og:description"]', meta.description)
    setMeta('meta[property="og:locale"]', ogLocale)
  }, [lang])

  // Without a manual choice, follow the browser if its language setting changes.
  useEffect(() => {
    const onLanguageChange = () => {
      if (readStoredLanguage() || readUrlLanguage()) return
      setLangState(detectBrowserLanguage() ?? DEFAULT_LANGUAGE)
    }
    window.addEventListener('languagechange', onLanguageChange)
    return () => window.removeEventListener('languagechange', onLanguageChange)
  }, [])

  const value = useMemo(
    () => ({
      lang,
      t: dictionaries[lang],
      setLang: (next: Language) => {
        setLangState(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        } catch {
          // ignore
        }
      },
    }),
    [lang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
