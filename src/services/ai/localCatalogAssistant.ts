import { getSupabase } from '../../lib/supabase'
import type { CatalogItem, CatalogSearchParams, VehicleModel } from '../../types'
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
      oe: parsed.oe,
      engine: parsed.engine,
      engine_cc: parsed.engineCc,
      fuel: parsed.fuel,
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
 * Two passes: the make first, then only that make's models (a large vehicle tree is
 * never loaded whole into the browser).
 */
async function understand(query: string): Promise<ParsedQuery> {
  const makes = await catalogProvider.listMakes()
  const first = parseQuery(query, makes, [])
  let models: VehicleModel[]
  if (first.make) models = await catalogProvider.listModels(first.make.id)
  else models = await catalogProvider.listModels()
  return parseQuery(query, makes, models)
}

/**
 * Rule-based assistant over the CatalogProvider. It does not "generate" anything:
 * it turns the request into structured filters (part words, vehicle, year, engine,
 * condition, reference / OE), searches, and reports exactly what the catalogue returned.
 */
export const localCatalogAssistant: AiProvider = {
  name: 'local',

  async ask(query: string, options: AskOptions): Promise<AssistantAnswer> {
    const parsed = await understand(query)

    // VIN / plate: only when a configured provider really decodes them.
    if (parsed.vin || parsed.plate) {
      const lookup = parsed.vin
        ? await catalogProvider.searchByVIN(parsed.vin)
        : await catalogProvider.searchByPlate(parsed.plate!, '')
      const vehicle = lookup.vehicles[0]
      if (lookup.supported) parsed.unsupported = undefined
      if (vehicle?.makeId && !parsed.make) {
        const makes = await catalogProvider.listMakes()
        parsed.make = makes.find((m) => m.id === vehicle.makeId)
        if (vehicle.modelId) {
          const models = await catalogProvider.listModels(vehicle.makeId)
          parsed.model = models.find((m) => m.id === vehicle.modelId)
        }
        parsed.year ??= vehicle.year ?? undefined
        parsed.fuel ??= vehicle.fuel ?? undefined
      }
    }

    const base: CatalogSearchParams = {
      query: parsed.text,
      condition: parsed.condition,
      reference: parsed.reference,
      oe: parsed.oe,
      limit: MAX_RESULTS,
    }
    const withVehicle: CatalogSearchParams = {
      ...base,
      makeId: parsed.make?.id,
      modelId: parsed.model?.id,
      year: parsed.year,
      fuel: parsed.fuel,
      engineCc: parsed.engineCc,
      engine: parsed.engine,
    }

    let result = await catalogProvider.searchProducts(withVehicle)
    let vehicleRelaxed = false
    if (result.items.length === 0 && parsed.make) {
      // Nothing fits that vehicle: show similar parts, clearly flagged as unconfirmed.
      result = await catalogProvider.searchProducts(base)
      vehicleRelaxed = result.items.length > 0
    }

    const confirmed = !vehicleRelaxed && result.items.some((item) => isFullMatch(item, result.terms))
    const kind: AnswerKind = result.items.length === 0 ? 'none' : confirmed ? 'confirmed' : 'related'
    const items = confirmed ? result.items.filter((item) => isFullMatch(item, result.terms)) : result.items

    return { kind, items, parsed, vehicleRelaxed, provider: this.name, conversationId: options.conversationId ?? null }
  },
}
