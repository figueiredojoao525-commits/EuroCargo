// Picks the catalogue adapter from Supabase secrets. Credentials are read here and only here;
// they are never returned to the browser nor stored in the database.
//
//   supabase secrets set CATALOG_PROVIDER=<adapter> CATALOG_API_URL=<url> CATALOG_API_KEY=<key>
//
// To add a provider: write adapters/<name>.ts implementing CatalogAdapter and register it below.
import { createEuroCargoFeedAdapter } from './adapters/eurocargo-feed.ts'
import { createTecDocAdapter } from './adapters/tecdoc.ts'
import type { AdapterConfig, CatalogAdapter } from './types.ts'

const ADAPTERS: Record<string, (config: AdapterConfig) => CatalogAdapter> = {
  'eurocargo-feed': createEuroCargoFeedAdapter,
  tecdoc: createTecDocAdapter,
}

export function configuredProviderName(): string | null {
  return Deno.env.get('CATALOG_PROVIDER')?.trim() || null
}

/**
 * Adapter for the configured provider, or null when secrets are missing / the adapter is
 * unknown / it has no capabilities yet. `settings` = the source's non-secret config.
 */
export function getCatalogAdapter(settings: Record<string, unknown> = {}): CatalogAdapter | null {
  const provider = configuredProviderName()
  const url = Deno.env.get('CATALOG_API_URL')?.trim()
  const key = Deno.env.get('CATALOG_API_KEY')?.trim()
  if (!provider || !url || !key) return null
  const create = ADAPTERS[provider]
  if (!create) {
    console.warn(`CATALOG_PROVIDER "${provider}" has no adapter`)
    return null
  }
  const adapter = create({ url, key, settings })
  return adapter.capabilities.length > 0 ? adapter : null
}
