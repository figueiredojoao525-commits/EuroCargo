// POST { query, lang, conversation_id } — parts assistant backed by an AI provider.
//
// Flow: AI interprets the request into structured filters → CatalogProvider.searchProducts()
// (catalog_search() with the caller's own rights, so RLS applies) → answer built ONLY from
// those rows. The AI never produces products, prices, stock or compatibility.
// While no provider is configured it answers 503 and the website uses its local
// rule-based assistant instead (src/services/ai).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getAiBackend } from '../_shared/ai-provider.ts'
import { createServerCatalog } from '../_shared/catalog/provider.ts'
import { corsHeaders, json, requireEnv } from '../_shared/http.ts'

const MAX_RESULTS = 8
const FUELS = ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const backend = getAiBackend()
  if (!backend) return json({ error: 'ai_not_configured' }, 503)

  let body: { query?: unknown; lang?: unknown; conversation_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 300) : ''
  const lang = typeof body.lang === 'string' ? body.lang.slice(0, 5) : 'pt'
  if (!query) return json({ error: 'empty_query' }, 400)

  // Public (publishable/anon) key + the caller's JWT when signed in: same rights as the browser.
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const catalog = createServerCatalog(supabase)

  let makes, models
  try {
    ;[makes, models] = await Promise.all([catalog.listMakes(), catalog.listModels()])
  } catch (error) {
    console.error('catalogue unavailable', error)
    return json({ error: 'database_error' }, 500)
  }

  let parsed
  try {
    parsed = await backend.interpret(query, lang, {
      makes: makes.map((m) => m.name),
      models: models.map((m) => m.name),
    })
  } catch (error) {
    console.error('AI interpretation failed', error)
    return json({ error: 'ai_error' }, 502)
  }

  // Only accept vehicles and values that exist / are valid.
  const make = makes.find((m) => m.name.toLowerCase() === parsed.make?.toLowerCase())
  const model = models.find(
    (m) => m.name.toLowerCase() === parsed.model?.toLowerCase() && (!make || m.make_id === make.id),
  )
  const year = Number.isInteger(parsed.year) && parsed.year! > 1900 && parsed.year! < 2100 ? parsed.year : undefined
  const condition = parsed.condition === 'new' || parsed.condition === 'used' ? parsed.condition : undefined
  const fuel = parsed.fuel && FUELS.includes(parsed.fuel) ? parsed.fuel : undefined
  const engineCc =
    Number.isInteger(parsed.engineCc) && parsed.engineCc! >= 500 && parsed.engineCc! <= 9000 ? parsed.engineCc : undefined
  const engine = typeof parsed.engine === 'string' ? parsed.engine.trim().slice(0, 40) || undefined : undefined

  const base = {
    query: parsed.text || undefined,
    condition,
    reference: parsed.reference,
    oe: parsed.oe,
    limit: MAX_RESULTS,
  }
  const withVehicle = {
    ...base,
    makeId: make?.id ?? model?.make_id,
    modelId: model?.id,
    year,
    fuel,
    engineCc,
    engine,
  }

  let result
  let vehicleRelaxed = false
  try {
    result = await catalog.searchProducts(withVehicle)
    if (result.items.length === 0 && withVehicle.makeId) {
      result = await catalog.searchProducts(base)
      vehicleRelaxed = result.items.length > 0
    }
  } catch (error) {
    console.error('search failed', error)
    return json({ error: 'database_error' }, 500)
  }

  const terms: string[] = result.terms ?? []
  type Item = (typeof result.items)[number]
  const full = (item: Item) => item.ref_match || (terms.length > 0 && item.matched_terms === terms.length)
  const items = result.items ?? []
  const confirmed = !vehicleRelaxed && items.some(full)
  const kind = items.length === 0 ? 'none' : confirmed ? 'confirmed' : 'related'
  const shown = confirmed ? items.filter(full) : items

  const answer = {
    kind,
    items: shown,
    parsed: {
      original: query,
      text: parsed.text,
      make,
      model,
      year,
      condition,
      reference: parsed.reference,
      oe: parsed.oe,
      engine,
      engineCc,
      fuel,
    },
    vehicleRelaxed,
    provider: backend.name,
    conversationId: typeof body.conversation_id === 'string' ? body.conversation_id : null,
  }

  const { data: conversationId } = await supabase.rpc('log_assistant_exchange', {
    p_query: query,
    p_answer: `${kind}: ${shown.length}`,
    p_product_ids: shown.map((i) => i.id).slice(0, 20),
    p_parsed: {
      make: make?.name,
      model: model?.name,
      year,
      condition,
      reference: parsed.reference,
      oe: parsed.oe,
      engine,
      engine_cc: engineCc,
      fuel,
      text: parsed.text,
    },
    p_matched: kind === 'confirmed',
    p_results_count: shown.length,
    p_provider: backend.name,
    p_conversation_id: answer.conversationId,
  })
  if (typeof conversationId === 'string') answer.conversationId = conversationId

  return json(answer)
})
