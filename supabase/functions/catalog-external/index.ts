// POST { action, ... } — live access to a LICENSED external catalogue (TecDoc / TecAlliance,
// a supplier API, …) through a server-side adapter (../_shared/catalog).
//
//   status                    → { configured, provider, capabilities }   (never secrets)
//   search { params }         → catalog_search() rows, after storing the provider's matches
//   vin { vin }               → { supported, vehicles[] }
//   plate { plate, country }  → { supported, vehicles[] }
//
// Search flow: adapter.search() → rows stored with catalog_import_rows() (service_role; same
// validation, de-duplication and pricing rules as the admin import) → answer with
// catalog_search() using the CALLER's rights (RLS). The browser therefore always gets local
// ids, public prices from the pricing rules and never costs or supplier data.
// Repeated queries are served from the local tables for `cache_ttl_minutes` (catalog_live_queries).
//
// Credentials only in Supabase secrets (CATALOG_PROVIDER / CATALOG_API_URL / CATALOG_API_KEY).
// No scraping. While nothing is configured this answers 503 and the website uses the local catalogue.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createServerCatalog, findSource, importRows, type SearchParams } from '../_shared/catalog/provider.ts'
import { configuredProviderName, getCatalogAdapter } from '../_shared/catalog/registry.ts'
import type { AdapterQuery, VehicleMatch } from '../_shared/catalog/types.ts'
import { corsHeaders, json, requireEnv } from '../_shared/http.ts'

const MAX_RESULTS = 24

function cleanParams(raw: unknown): SearchParams {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = (k: string, max = 100) => (typeof p[k] === 'string' ? (p[k] as string).trim().slice(0, max) : undefined)
  const int = (k: string) => (Number.isInteger(p[k]) ? (p[k] as number) : undefined)
  return {
    query: text('query', 300),
    reference: text('reference', 80),
    oe: text('oe', 80),
    makeId: text('makeId', 36),
    modelId: text('modelId', 36),
    variantId: text('variantId', 36),
    year: int('year'),
    fuel: text('fuel', 20),
    engineCc: int('engineCc'),
    engine: text('engine', 40),
    categoryId: text('categoryId', 36),
    condition: p.condition === 'new' || p.condition === 'used' ? p.condition : undefined,
    brandId: text('brandId', 36),
    limit: Math.min(int('limit') ?? MAX_RESULTS, 60),
    offset: Math.max(int('offset') ?? 0, 0),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { action?: string; params?: unknown; vin?: unknown; plate?: unknown; country?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const service = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
  // The caller's own rights for every read returned to the browser.
  const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })

  try {
    const source = await findSource(service, 'live')
    const adapter = getCatalogAdapter(source?.config ?? {})

    if (body.action === 'status') {
      return adapter
        ? json({ configured: true, provider: configuredProviderName(), capabilities: adapter.capabilities, source: source?.key ?? null })
        : json({ configured: false, provider: configuredProviderName(), capabilities: [] }, 503)
    }
    if (!adapter || !source) return json({ error: 'catalog_not_configured' }, 503)
    const catalog = createServerCatalog(caller)

    switch (body.action) {
      case 'search': {
        const params = cleanParams(body.params)
        const hasQuery = (params.query?.length ?? 0) >= 3 || !!params.reference || !!params.oe || !!params.makeId
        if (adapter.search && hasQuery) {
          // Names (not ids) go to the provider.
          const [makes, models] = await Promise.all([
            params.makeId ? catalog.listMakes() : Promise.resolve([]),
            params.makeId ? catalog.listModels(params.makeId) : Promise.resolve([]),
          ])
          const query: AdapterQuery = {
            text: params.query,
            reference: params.reference,
            oe: params.oe,
            make: makes.find((m) => m.id === params.makeId)?.name,
            model: models.find((m) => m.id === params.modelId)?.name,
            year: params.year,
            fuel: params.fuel,
            engineCc: params.engineCc,
            engine: params.engine,
            limit: params.limit ?? MAX_RESULTS,
          }
          const queryKey = JSON.stringify(query).toLowerCase().slice(0, 300)
          const { data: cached } = await service
            .from('catalog_live_queries')
            .select('fetched_at')
            .eq('source_id', source.id)
            .eq('query_key', queryKey)
            .maybeSingle()
          const fresh =
            cached && Date.now() - new Date(cached.fetched_at).getTime() < source.cache_ttl_minutes * 60_000
          if (!fresh) {
            const rows = await adapter.search(query)
            if (rows.length) await importRows(service, source.id, rows.slice(0, 200), { fileName: `live:${source.key}` })
            await service
              .from('catalog_live_queries')
              .upsert({ source_id: source.id, query_key: queryKey, results: rows.length, fetched_at: new Date().toISOString() })
          }
        }
        return json(await catalog.searchProducts(params))
      }

      case 'vin':
      case 'plate': {
        const decode = body.action === 'vin' ? adapter.decodeVin : adapter.decodePlate
        if (!decode || !adapter.capabilities.includes(body.action)) return json({ supported: false, vehicles: [] })
        const value = String(body.action === 'vin' ? body.vin : body.plate ?? '')
          .trim()
          .toUpperCase()
          .slice(0, 20)
        if (!value) return json({ error: 'invalid_value' }, 400)
        const found: VehicleMatch[] =
          body.action === 'vin'
            ? await adapter.decodeVin!(value)
            : await adapter.decodePlate!(value, String(body.country ?? '').slice(0, 2))
        // Link to EuroCargo's vehicle tables when the vehicle exists there.
        const vehicles = await Promise.all(
          found.slice(0, 10).map(async (v) => ({ ...v, ...(await catalog.findVehicle(v.make, v.model)) })),
        )
        return json({ supported: true, vehicles })
      }

      default:
        return json({ error: 'invalid_action' }, 400)
    }
  } catch (error) {
    console.error('catalog-external failed', error)
    return json({ error: 'catalog_provider_error' }, 502)
  }
})
