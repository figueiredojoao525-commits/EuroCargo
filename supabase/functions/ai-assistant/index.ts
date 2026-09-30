// POST { query, lang, conversation_id } — parts assistant backed by an AI provider.
//
// Flow: AI interprets the request → search_products() in the database (called with
// the caller's own rights, so RLS applies) → answer built ONLY from those rows.
// While no provider is configured it answers 503 and the website uses its local
// rule-based assistant instead (src/services/ai).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getAiBackend } from '../_shared/ai-provider.ts'
import { corsHeaders, json, requireEnv } from '../_shared/http.ts'

const MAX_RESULTS = 8

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

  const [{ data: makes }, { data: models }] = await Promise.all([
    supabase.from('vehicle_makes').select('id, name, slug, active').eq('active', true),
    supabase.from('vehicle_models').select('id, make_id, name, slug, body_type, year_from, year_to, active').eq('active', true),
  ])

  let parsed
  try {
    parsed = await backend.interpret(query, lang, {
      makes: (makes ?? []).map((m) => m.name),
      models: (models ?? []).map((m) => m.name),
    })
  } catch (error) {
    console.error('AI interpretation failed', error)
    return json({ error: 'ai_error' }, 502)
  }

  // Only accept vehicles that exist in the database.
  const make = (makes ?? []).find((m) => m.name.toLowerCase() === parsed.make?.toLowerCase())
  const model = (models ?? []).find(
    (m) => m.name.toLowerCase() === parsed.model?.toLowerCase() && (!make || m.make_id === make.id),
  )
  const year = Number.isInteger(parsed.year) && parsed.year! > 1900 && parsed.year! < 2100 ? parsed.year : undefined
  const condition = parsed.condition === 'new' || parsed.condition === 'used' ? parsed.condition : undefined

  const search = (withVehicle: boolean) =>
    supabase.rpc('search_products', {
      p_query: parsed.text || null,
      p_make_id: withVehicle ? (make?.id ?? null) : null,
      p_model_id: withVehicle ? (model?.id ?? null) : null,
      p_year: withVehicle ? (year ?? null) : null,
      p_condition: condition ?? null,
      p_reference: parsed.reference ?? null,
      p_limit: MAX_RESULTS,
    })

  let { data: result, error } = await search(true)
  let vehicleRelaxed = false
  if (!error && result?.items?.length === 0 && make) {
    ;({ data: result, error } = await search(false))
    vehicleRelaxed = (result?.items?.length ?? 0) > 0
  }
  if (error) {
    console.error('search failed', error)
    return json({ error: 'database_error' }, 500)
  }

  type Item = { ref_match: boolean; matched_terms: number; id: string }
  const terms: string[] = result.terms ?? []
  const full = (item: Item) => item.ref_match || (terms.length > 0 && item.matched_terms === terms.length)
  const items: Item[] = result.items ?? []
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
    },
    vehicleRelaxed,
    provider: backend.name,
    conversationId: typeof body.conversation_id === 'string' ? body.conversation_id : null,
  }

  const { data: conversationId } = await supabase.rpc('log_assistant_exchange', {
    p_query: query,
    p_answer: `${kind}: ${shown.length}`,
    p_product_ids: shown.map((i) => i.id).slice(0, 20),
    p_parsed: { make: make?.name, model: model?.name, year, condition, reference: parsed.reference, text: parsed.text },
    p_matched: kind === 'confirmed',
    p_results_count: shown.length,
    p_provider: backend.name,
    p_conversation_id: answer.conversationId,
  })
  if (typeof conversationId === 'string') answer.conversationId = conversationId

  return json(answer)
})
