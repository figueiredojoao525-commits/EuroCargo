// WhatsApp "click to chat" links (https://wa.me). The business numbers are public
// information, configured per country (international format, digits only):
//   VITE_WHATSAPP_PT=351…   VITE_WHATSAPP_ES=34…
import type { Dictionary, Language } from '../i18n'
import type { PartCondition } from '../types'

export const WHATSAPP_REGIONS = ['PT', 'ES'] as const
export type WhatsAppRegion = (typeof WHATSAPP_REGIONS)[number]

const digits = (value: string | undefined) => (value ?? '').replace(/\D/g, '')
const NUMBERS: Record<WhatsAppRegion, string> = {
  PT: digits(import.meta.env.VITE_WHATSAPP_PT),
  ES: digits(import.meta.env.VITE_WHATSAPP_ES),
}
/** Regions with a usable number, in display order. */
const configured = WHATSAPP_REGIONS.filter((region) => NUMBERS[region].length >= 8)

export interface WhatsAppContext {
  product?: string
  vehicle?: string
  year?: number | string
  reference?: string
  condition?: PartCondition
  question?: string
  trackingCode?: string
  orderNumber?: string
}

function buildMessage(context: WhatsAppContext, t: Dictionary): string {
  const w = t.whatsapp
  const lines = [w.greeting]
  const subject = [context.product, context.vehicle, context.year].filter(Boolean).join(' ')
  if (subject) lines.push(`${w.interestedIn} ${subject}.`)
  if (context.reference) lines.push(`${w.reference}: ${context.reference}`)
  if (context.condition) lines.push(`${w.condition}: ${t.condition[context.condition]}`)
  if (context.orderNumber) lines.push(`${w.order}: ${context.orderNumber}`)
  if (context.trackingCode) lines.push(`${w.trackingCode}: ${context.trackingCode}`)
  if (context.question?.trim()) lines.push(context.question.trim())
  return lines.join('\n')
}

/** "351938224180" → "+351 938 224 180"; "34629075357" → "+34 629 07 53 57". */
function formatNumber(region: WhatsAppRegion): string {
  const n = NUMBERS[region]
  if (region === 'PT' && /^351\d{9}$/.test(n)) return `+351 ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`
  if (region === 'ES' && /^34\d{9}$/.test(n))
    return `+34 ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)} ${n.slice(9)}`
  return `+${n}`
}

export const whatsappService = {
  /** False when no number is configured: callers should hide WhatsApp actions. */
  isConfigured: configured.length > 0,

  /** Configured regions (PT, ES). */
  regions: configured as readonly WhatsAppRegion[],

  /**
   * Which EuroCargo number fits the customer: their account country (PT/ES) first,
   * then the site language (pt → PT, es → ES). null = unknown → offer every number.
   */
  resolveRegion({ country, lang }: { country?: string | null; lang: Language }): WhatsAppRegion | null {
    const fromCountry = country === 'PT' || country === 'ES' ? country : null
    const fromLang = lang === 'pt' ? 'PT' : lang === 'es' ? 'ES' : null
    const region = fromCountry ?? fromLang
    if (region && configured.includes(region)) return region
    return configured.length === 1 ? configured[0] : null
  },

  message: buildMessage,

  displayNumber: formatNumber,

  /** Link to the EuroCargo WhatsApp of that region with a pre-filled message. */
  link(context: WhatsAppContext, t: Dictionary, region: WhatsAppRegion): string {
    return `https://wa.me/${NUMBERS[region]}?text=${encodeURIComponent(buildMessage(context, t))}`
  },

  /** Link to a customer's WhatsApp (admin sending a tracking code), or null without a usable phone. */
  linkTo(phone: string | null | undefined, text: string): string | null {
    const customer = digits(phone ?? '').replace(/^00/, '')
    if (customer.length < 8) return null
    return `https://wa.me/${customer}?text=${encodeURIComponent(text)}`
  },
}
