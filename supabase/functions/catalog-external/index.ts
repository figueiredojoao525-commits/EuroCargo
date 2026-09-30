// POST { action: 'search' | 'product' | 'alternatives', ... } — proxy to a LICENSED
// external parts catalogue (TecDoc / TecAlliance or a similar provider).
//
// The provider's credentials live only in Supabase secrets:
//   supabase secrets set CATALOG_PROVIDER=<name> CATALOG_API_URL=<url> CATALOG_API_KEY=<key>
// Responses must be mapped to the same shapes the website already uses
// (CatalogSearchResult / ProductDetail in src/types/catalog.ts), with
// data_source set to the provider name. Do not scrape shops or copy images,
// prices or data without a licence.
//
// While no adapter is configured this answers 503 and the website keeps using
// the local catalogue (src/services/catalog).
import { corsHeaders, json } from '../_shared/http.ts'

interface ExternalCatalog {
  search(params: Record<string, unknown>): Promise<unknown>
  product(id: string): Promise<unknown>
  alternatives(id: string, groupKey: string | null): Promise<unknown>
}

function getExternalCatalog(): ExternalCatalog | null {
  const provider = Deno.env.get('CATALOG_PROVIDER')
  const url = Deno.env.get('CATALOG_API_URL')
  const key = Deno.env.get('CATALOG_API_KEY')
  if (!provider || !url || !key) return null
  // Add the licensed provider's adapter here once the contract/credentials exist.
  console.warn(`CATALOG_PROVIDER "${provider}" has no adapter yet`)
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const catalog = getExternalCatalog()
  if (!catalog) return json({ error: 'catalog_not_configured' }, 503)

  let body: { action?: string; params?: Record<string, unknown>; id?: string; group_key?: string | null }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  try {
    switch (body.action) {
      case 'search':
        return json(await catalog.search(body.params ?? {}))
      case 'product':
        return typeof body.id === 'string' ? json(await catalog.product(body.id)) : json({ error: 'invalid_id' }, 400)
      case 'alternatives':
        return typeof body.id === 'string'
          ? json(await catalog.alternatives(body.id, body.group_key ?? null))
          : json({ error: 'invalid_id' }, 400)
      default:
        return json({ error: 'invalid_action' }, 400)
    }
  } catch (error) {
    console.error('external catalogue failed', error)
    return json({ error: 'catalog_provider_error' }, 502)
  }
})
