import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { it } from './it'
import { pt, type Dictionary } from './pt'

export const LANGUAGES = ['pt', 'es', 'en', 'fr', 'de', 'it'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'pt'

export const dictionaries: Record<Language, Dictionary> = { pt, es, en, fr, de, it }

/**
 * Per-language metadata. `name` is the language's own name (endonym), so it is
 * the same in every dictionary. `locale` drives Intl formatting and `og:locale`.
 */
export const LANGUAGE_META: Record<Language, { name: string; locale: string }> = {
  pt: { name: 'Português', locale: 'pt-PT' },
  es: { name: 'Español', locale: 'es-ES' },
  en: { name: 'English', locale: 'en-GB' },
  fr: { name: 'Français', locale: 'fr-FR' },
  de: { name: 'Deutsch', locale: 'de-DE' },
  it: { name: 'Italiano', locale: 'it-IT' },
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** Maps a BCP 47 tag to a supported language by its primary subtag: 'pt-BR' → 'pt', 'en-GB' → 'en'. */
export function matchLanguage(tag: string | null | undefined): Language | null {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0]
  return isLanguage(base) ? base : null
}

/** First supported language from the browser's preference list, or null if none match. */
export function detectBrowserLanguage(): Language | null {
  if (typeof navigator === 'undefined') return null
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of preferred) {
    const match = matchLanguage(tag)
    if (match) return match
  }
  return null
}

/** Replaces `{key}` placeholders: interpolate('Olá, {name}', { name: 'Ana' }). */
export function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

export type { Dictionary }
