import type { Language } from '../../i18n'
import type { CatalogItem } from '../../types'
import type { ParsedQuery } from './queryParser'
import type { CatalogStatus, ShopTopic } from './shopQuestions'

/**
 * - confirmed: every search term matched (or the exact reference) and, when a
 *   vehicle was given, the product's compatibility covers it.
 * - related: partial matches, or matches without confirmed compatibility.
 * - none: nothing in the catalogue.
 */
export type AnswerKind = 'confirmed' | 'related' | 'none'

export interface AssistantAnswer {
  kind: AnswerKind
  items: CatalogItem[]
  parsed: ParsedQuery
  /** True when no product fits the vehicle and the results ignore it. */
  vehicleRelaxed: boolean
  provider: string
  conversationId: string | null
  /**
   * Objective follow-up when essential information is missing:
   * whichVehicle — the part fits several vehicles; whichPart — only a vehicle was given.
   */
  question?: 'whichVehicle' | 'whichPart'
  /**
   * The customer asked about the shop (prices, stock, DEMO data, orders): answered with
   * fixed texts and the real catalogue counts. `searched` is false when there was no part
   * to look for, so no search summary is shown.
   */
  info?: { topics: ShopTopic[]; catalog: CatalogStatus | null; searched: boolean }
  /** The external AI failed: this answer comes from the catalogue search alone. */
  notice?: 'externalUnavailable'
  /** Resolves once the exchange is logged, with the (possibly new) conversation id. */
  logged?: Promise<string | null>
}

export interface AskOptions {
  lang: Language
  conversationId?: string | null
}

/**
 * Parts assistant. Implementations may interpret the request however they like,
 * but every product, price, stock level and compatibility they return MUST come
 * from the catalogue (local tables or a configured external source).
 */
export interface AiProvider {
  readonly name: string
  ask(query: string, options: AskOptions): Promise<AssistantAnswer>
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('ai_not_configured')
  }
}
