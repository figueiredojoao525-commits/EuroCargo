import { getSupabase } from '../../lib/supabase'
import type { CatalogItem, CatalogSearchParams } from '../../types'
import { catalogProvider } from '../catalog'
import { parseQuery, type ParsedQuery } from './queryParser'
import type { AiProvider, AnswerKind, AskOptions, AssistantAnswer } from './types'

const MAX_RESULTS = 8

function isFullMatch(item: CatalogItem, terms: string[]): boolean {
  return item.ref_match || (terms.length > 0 && item.matched_terms === terms.length)
}

/**
 * Stores the exchange for the admin "AI" page. Resolves to the conversation id
 * (signed-in users) or null; never rejects, so it cannot break the answer.
 */
export function logExchange(query: string, answer: AssistantAnswer): Promise<string | null> {
  const { parsed } = answer
  const request = getSupabase().rpc('log_assistant_exchange', {
    p_query: query,
    p_answer: `${answer.kind}: ${answer.items.length}`,
    p_product_ids: answer.items.map((item) => item.id).slice(0, 20),
    p_parsed: {
      make: parsed.make?.name,
      model: parsed.model?.name,
      year: parsed.year,
      condition: parsed.condition,
      reference: parsed.reference,
      text: parsed.text,
      unsupported: parsed.unsupported,
    },
    p_matched: answer.kind === 'confirmed',
    p_results_count: answer.items.length,
    p_provider: answer.provider,
    p_conversation_id: answer.conversationId,
  })
  return Promise.resolve(request).then(
    ({ data }) => (typeof data === 'string' ? data : null),
    () => null,
  )
}

/**
 * Rule-based assistant over the catalogue. It does not "generate" anything:
 * it extracts vehicle / year / condition / reference, searches, and reports
 * exactly what the catalogue returned.
 */
export const localCatalogAssistant: AiProvider = {
  name: 'local',

  async ask(query: string, options: AskOptions): Promise<AssistantAnswer> {
    const [makes, models] = await Promise.all([catalogProvider.listMakes(), catalogProvider.listModels()])
    const parsed: ParsedQuery = parseQuery(query, makes, models)

    const base: CatalogSearchParams = {
      query: parsed.text,
      condition: parsed.condition,
      reference: parsed.reference,
      limit: MAX_RESULTS,
    }
    const withVehicle: CatalogSearchParams = {
      ...base,
      makeId: parsed.make?.id,
      modelId: parsed.model?.id,
      year: parsed.year,
    }

    let result = await catalogProvider.search(withVehicle)
    let vehicleRelaxed = false
    if (result.items.length === 0 && parsed.make) {
      // Nothing fits that vehicle: show similar parts, clearly flagged as unconfirmed.
      result = await catalogProvider.search(base)
      vehicleRelaxed = result.items.length > 0
    }

    const confirmed = !vehicleRelaxed && result.items.some((item) => isFullMatch(item, result.terms))
    const kind: AnswerKind = result.items.length === 0 ? 'none' : confirmed ? 'confirmed' : 'related'
    const items = confirmed ? result.items.filter((item) => isFullMatch(item, result.terms)) : result.items

    return { kind, items, parsed, vehicleRelaxed, provider: this.name, conversationId: options.conversationId ?? null }
  },
}
