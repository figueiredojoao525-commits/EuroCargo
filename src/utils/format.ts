import { LANGUAGE_META, type Language } from '../i18n'

const locale = (lang: Language) => LANGUAGE_META[lang].locale

export function formatDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(locale(lang), { dateStyle: 'medium' })
}

export function formatDateTime(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(locale(lang), { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatMoney(amount: number, currency: string, lang: Language): string {
  return new Intl.NumberFormat(locale(lang), { style: 'currency', currency }).format(amount)
}

const regionNames = new Map<Language, Intl.DisplayNames>()

/** Localised country name from an ISO code (uses the browser's Intl data, no external API). */
export function countryName(code: string, lang: Language): string {
  let names = regionNames.get(lang)
  if (!names) {
    names = new Intl.DisplayNames([locale(lang)], { type: 'region' })
    regionNames.set(lang, names)
  }
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}
