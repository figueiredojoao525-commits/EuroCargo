// Generic REST adapter for suppliers (or a small middleware) that expose the documented
// "EuroCargo catalogue feed" contract — see docs/catalog-import.md:
//
//   GET {CATALOG_API_URL}/products?cursor=<cursor>&limit=<n>
//       → { "items": ImportRow[], "next_cursor": string | null }
//   GET {CATALOG_API_URL}/search?q=&reference=&oe=&make=&model=&year=&limit=
//       → { "items": ImportRow[] }
//   GET {CATALOG_API_URL}/vehicles/vin/{vin}
//       → { "vehicles": VehicleMatch[] }
//
// Authentication: "Authorization: Bearer {CATALOG_API_KEY}". Nothing is called unless the
// URL and key are configured as Supabase secrets.
import type { AdapterConfig, AdapterQuery, CatalogAdapter, ImportRow, SyncPage, VehicleMatch } from '../types.ts'

const TIMEOUT_MS = 20_000

export function createEuroCargoFeedAdapter(config: AdapterConfig): CatalogAdapter {
  const base = config.url.replace(/\/+$/, '')
  const pageSize = Number(config.settings.page_size ?? 500)
  const capabilities = Array.isArray(config.settings.capabilities)
    ? (config.settings.capabilities as CatalogAdapter['capabilities'])
    : (['search', 'reference', 'oe', 'vehicle', 'sync'] as const)

  async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(base + path)
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`catalog_provider_http_${response.status}`)
    return (await response.json()) as T
  }

  return {
    name: 'eurocargo-feed',
    capabilities,

    async search(query: AdapterQuery): Promise<ImportRow[]> {
      const data = await get<{ items?: ImportRow[] }>('/search', {
        q: query.text,
        reference: query.reference,
        oe: query.oe,
        make: query.make,
        model: query.model,
        year: query.year,
        fuel: query.fuel,
        engine_cc: query.engineCc,
        engine: query.engine,
        limit: query.limit,
      })
      return Array.isArray(data.items) ? data.items : []
    },

    async decodeVin(vin: string): Promise<VehicleMatch[]> {
      const data = await get<{ vehicles?: VehicleMatch[] }>(`/vehicles/vin/${encodeURIComponent(vin)}`)
      return Array.isArray(data.vehicles) ? data.vehicles : []
    },

    async fetchChanges(cursor: string | null): Promise<SyncPage> {
      const data = await get<{ items?: ImportRow[]; next_cursor?: string | null }>('/products', {
        cursor: cursor ?? undefined,
        limit: Math.min(Math.max(pageSize, 1), 1000),
      })
      return { rows: Array.isArray(data.items) ? data.items : [], nextCursor: data.next_cursor ?? null }
    },
  }
}
