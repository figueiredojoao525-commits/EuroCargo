import { getSupabase } from '../../lib/supabase'
import type { CatalogItem, CatalogSearchParams } from '../../types'
import { catalogProvider, externalEnabled } from '../catalog'
import type { ParsedQuery } from './queryParser'
import { detectShopQuestion, type CatalogStatus } from './shopQuestions'
import { isStructured, understand } from './understand'
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
    p_answer: `${answer.info ? `info(${answer.info.topics.join(',')}) ` : ''}${answer.kind}: ${answer.items.length}`,
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
 * How many real and DEMO products the customer can see, so "are the prices real?" gets a
 * true answer. Unknown (null) while an external catalogue answers searches, or on error.
 */
async function catalogStatus(): Promise<CatalogStatus | null> {
  try {
    if (await externalEnabled()) return null
    const count = (demo: boolean) =>
      getSupabase().from('products').select('id', { count: 'exact', head: true }).eq('active', true).eq('is_demo', demo)
    const [demo, real] = await Promise.all([count(true), count(false)])
    if (demo.error || real.error || demo.count === null || real.count === null) return null
    return { demo: demo.count, real: real.count }
  } catch {
    return null
  }
}

type SearchPart = Pick<AssistantAnswer, 'kind' | 'items' | 'vehicleRelaxed' | 'question'>

async function searchCatalogue(parsed: ParsedQuery): Promise<SearchPart> {
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

  // Ask instead of guessing when essential information is missing.
  const hasPart = Boolean(parsed.text || parsed.reference || parsed.oe)
  const makesInResults = new Set(items.flatMap((item) => item.compatibility.map((c) => c.make)))
  const question: AssistantAnswer['question'] = !hasPart
    ? 'whichPart'
    : !parsed.make && !parsed.reference && !parsed.oe && makesInResults.size > 1
      ? 'whichVehicle'
      : undefined

  return { kind, items, vehicleRelaxed, question }
}

/**
 * Rule-based assistant over the CatalogProvider. It does not "generate" anything:
 * it turns the request into structured filters (part words, vehicle, year, engine,
 * condition, reference / OE), searches, and reports exactly what the catalogue returned.
 * Questions about the shop (prices, stock, DEMO data, orders) get fixed, true answers first.
 */
export const localCatalogAssistant: AiProvider = {
  name: 'local',

  async ask(query: string, options: AskOptions): Promise<AssistantAnswer> {
    const shop = detectShopQuestion(query)
    const parsed: ParsedQuery =
      shop && !shop.searchText ? { original: query, text: '' } : await understand(shop ? shop.searchText : query)
    parsed.original = query

    // VIN / plate: only when a configured provider really decodes them.
    if (parsed.vin || parsed.plate) {
      const lookup = parsed.vin
        ? await catalogProvider.searchByVIN(parsed.vin)
        : await catalogProvider.searchByPlate(parsed.plate!, '')
      const vehicle = lookup.vehicles[0]
      // Keep the "VIN not identified" notice when nothing was decoded.
      if (lookup.supported && vehicle) parsed.unsupported = undefined
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

    const common = { parsed, provider: this.name, conversationId: options.conversationId ?? null }
    if (!shop) return { ...(await searchCatalogue(parsed)), ...common }

    const wantsPart = Boolean(parsed.text || parsed.reference || parsed.oe || parsed.make)
    const [catalog, found] = await Promise.all([catalogStatus(), wantsPart ? searchCatalogue(parsed) : null])
    // Leftover question words ("os preços que mostram…") must not bring loose matches:
    // keep exact results, or similar ones only when a vehicle / reference was given.
    const useful = found && (found.kind === 'confirmed' || (found.kind === 'related' && isStructured(parsed)))
    return {
      ...(useful ? found : { kind: 'none' as const, items: [], vehicleRelaxed: false }),
      ...common,
      info: { topics: shop.topics, catalog, searched: Boolean(useful) },
    }
  },
}
