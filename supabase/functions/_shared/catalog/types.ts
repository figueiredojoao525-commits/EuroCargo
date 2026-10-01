// Server-side catalogue provider contracts (Edge Functions only — never bundled into the website).
//
// An adapter talks to ONE external catalogue (supplier feed, TecDoc, …) and maps its data
// to ImportRow: the same canonical row the admin bulk import uses. Rows are then stored by
// catalog_import_rows() (service_role), so prices come from EuroCargo's pricing rules,
// costs stay internal and products can be ordered like any other.

export type Capability = 'search' | 'reference' | 'oe' | 'vehicle' | 'vin' | 'plate' | 'images' | 'compatibility' | 'sync'

/** Canonical import row — see supabase/migrations/20261002000000_catalog_scale_import.sql. */
export interface ImportRow {
  external_id?: string
  sku?: string
  reference?: string
  oe_numbers?: string[]
  ean?: string
  cross_references?: { reference: string; brand?: string }[]
  name?: string
  name_i18n?: Record<string, string>
  description?: string
  brand?: string
  manufacturer?: string
  category?: string
  condition?: 'new' | 'used'
  /** Public price only when the source sets it; otherwise leave empty and send `cost`. */
  price?: number
  currency?: string
  cost?: number
  cost_currency?: string
  stock?: number
  availability?: 'in_stock' | 'on_order' | 'on_request' | 'out_of_stock'
  lead_time_days?: number
  active?: boolean
  specs?: Record<string, string>
  supplier?: string
  supplier_reference?: string
  supplier_url?: string
  images?: { url: string; alt?: string; license?: string; source?: string; is_primary?: boolean; original_url?: string }[]
  vehicles?: {
    make: string
    model?: string
    generation?: string
    variant?: string
    engine_code?: string
    fuel?: 'petrol' | 'diesel' | 'hybrid' | 'electric' | 'lpg' | 'other'
    engine_cc?: number
    power_kw?: number
    power_hp?: number
    year_from?: number
    year_to?: number
    position?: string
    verified?: boolean
  }[]
  source_updated_at?: string
}

/** Search request after the website's parsing (all optional). */
export interface AdapterQuery {
  text?: string
  reference?: string
  oe?: string
  make?: string
  model?: string
  year?: number
  fuel?: string
  engineCc?: number
  engine?: string
  limit: number
}

export interface VehicleMatch {
  make: string
  model: string | null
  variant: string | null
  year: number | null
  engine_code: string | null
  fuel: string | null
}

export interface SyncPage {
  rows: ImportRow[]
  /** Opaque cursor for the next call (stored in catalog_sources.sync_cursor); null when done. */
  nextCursor: string | null
}

export interface CatalogAdapter {
  readonly name: string
  readonly capabilities: readonly Capability[]
  /** Live search: rows matching the query (stored locally before answering). */
  search?(query: AdapterQuery): Promise<ImportRow[]>
  decodeVin?(vin: string): Promise<VehicleMatch[]>
  decodePlate?(plate: string, country: string): Promise<VehicleMatch[]>
  /** Incremental sync: changes since `cursor` (null = from the beginning). */
  fetchChanges?(cursor: string | null): Promise<SyncPage>
}

export interface AdapterConfig {
  url: string
  key: string
  /** Non-secret settings from catalog_sources.config. */
  settings: Record<string, unknown>
}

export class AdapterNotImplementedError extends Error {
  constructor(adapter: string, feature: string) {
    super(`adapter_not_implemented: ${adapter}.${feature}`)
  }
}
