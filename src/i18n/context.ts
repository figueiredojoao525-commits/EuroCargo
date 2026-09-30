import { createContext, useContext } from 'react'
import type { Dictionary, Language } from './index'

export interface I18nContextValue {
  lang: Language
  t: Dictionary
  setLang: (lang: Language) => void
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
