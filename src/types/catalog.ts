// Catalogue types. Values must match the PostgreSQL enums/tables in
// supabase/migrations/20261001000100_parts_catalog_orders.sql.

export const PART_CONDITIONS = ['new', 'used'] as const
export type PartCondition = (typeof PART_CONDITIONS)[number]

export const AVAILABILITIES = ['in_stock', 'on_order', 'on_request', 'out_of_stock'] as const
export type Availability = (typeof AVAILABILITIES)[number]

/** Translations keyed by language code; the plain `name` column is the fallback. */
export type I18nText = Partial<Record<string, string>>

export interface Brand {
  id: string
  name: string
  slug: string
  country: string | null
  website: string | null
  is_demo: boolean
  active: boolean
  created_at: string
  updated_at: string
}

// Fields marked "(20261002)" exist once migration 20261002000000_catalog_scale_import is applied.

export interface VehicleMake {
  id: string
  name: string
  slug: string
  active: boolean
  external_id?: string | null
  data_source?: string
}

export interface VehicleModel {
  id: string
  make_id: string
  name: string
  slug: string
  body_type: string | null
  year_from: number | null
  year_to: number | null
  active: boolean
  /** Generation / series, e.g. "Mk5" (20261002). */
  generation?: string | null
  external_id?: string | null
  data_source?: string
}

export const FUELS = ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other'] as const
export type Fuel = (typeof FUELS)[number]

export interface VehicleVariant {
  id: string
  model_id: string
  name: string
  engine_code: string | null
  fuel: string | null
  power_kw: number | null
  engine_cc: number | null
  year_from: number | null
  year_to: number | null
  power_hp?: number | null
  body_type?: string | null
  external_id?: string | null
  data_source?: string
}

export interface PartCategory {
  id: string
  parent_id: string | null
  slug: string
  name: string
  name_i18n: I18nText
  icon: string | null
  position: number
  active: boolean
}

export interface Product {
  id: string
  sku: string | null
  name: string
  name_i18n: I18nText
  description: string | null
  brand_id: string | null
  category_id: string | null
  manufacturer: string | null
  part_number: string | null
  oe_numbers: string[]
  group_key: string | null
  condition: PartCondition
  /** Public EuroCargo price; null = price on request. */
  price: number | null
  currency: string
  /** Admin only (admin_products): how the price is set. */
  price_mode?: 'manual' | 'rules'
  availability: Availability
  stock_quantity: number | null
  lead_time_days: number | null
  specs: Record<string, string>
  /** Admin only (admin_products): origin key of the record. */
  data_source?: string
  /** Admin only: the source's own update date. */
  source_updated_at?: string | null
  is_demo: boolean
  active: boolean
  created_at: string
  updated_at: string
  /** Identifier at the source (supplier feed / licensed catalogue) (20261002). */
  external_id?: string | null
  ean?: string | null
  /** When EuroCargo last imported this record (admin only). */
  last_synced_at?: string | null
  /** Supplier whose offer defines availability / price (admin only, 20261004). */
  selected_supplier_id?: string | null
}

export interface ProductImage {
  id: string
  product_id: string
  /** Displayed URL (own bucket / CDN / licensed source). */
  url: string
  alt: string | null
  position: number
  /** Origin / credit. */
  source: string | null
  is_primary?: boolean
  /** Licence under which the image may be shown (20261002). */
  license?: string | null
  data_source?: string
}

export const REFERENCE_KINDS = ['part_number', 'oe', 'ean', 'cross'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

/** Public reference a product can be found by (20261002). Supplier SKUs are never here. */
export interface ProductReference {
  id: string
  product_id: string
  kind: ReferenceKind
  reference: string
  reference_norm: string
  brand: string | null
  source: string
}

export interface Compatibility {
  id: string
  product_id: string
  make_id: string
  model_id: string | null
  variant_id: string | null
  year_from: number | null
  year_to: number | null
  position: string | null
  notes: string | null
  /** Admin only. */
  source?: string
  verified: boolean
}

export type CompatibilityWithNames = Compatibility & {
  make: Pick<VehicleMake, 'name'> | null
  model: Pick<VehicleModel, 'name'> | null
  variant: Pick<VehicleVariant, 'name'> | null
}

/** Product page bundle: product + public relations. */
export type ProductDetail = Product & {
  brand: Pick<Brand, 'name'> | null
  category: Pick<PartCategory, 'id' | 'slug' | 'name' | 'name_i18n'> | null
  product_images: ProductImage[]
  product_vehicle_compatibility: CompatibilityWithNames[]
}

/** One row of search_products(). */
export interface CatalogItem {
  id: string
  name: string
  name_i18n: I18nText
  part_number: string | null
  oe_numbers: string[]
  manufacturer: string | null
  group_key: string | null
  brand: string | null
  category: Pick<PartCategory, 'id' | 'slug' | 'name' | 'name_i18n'> | null
  condition: PartCondition
  price: number | null
  currency: string
  availability: Availability
  stock_quantity: number | null
  lead_time_days: number | null
  is_demo: boolean
  updated_at: string
  image: string | null
  compatibility: {
    make: string
    model: string | null
    variant: string | null
    year_from: number | null
    year_to: number | null
    position: string | null
  }[]
  /** How many of the search terms this product matched. */
  matched_terms: number
  ref_match: boolean
}

export interface CatalogSearchParams {
  query?: string
  makeId?: string
  modelId?: string
  variantId?: string
  year?: number
  /** Engine filters: only exclude compatibility rows whose variant contradicts them. */
  fuel?: Fuel
  /** Displacement in cc (matches variants within ±60 cc), e.g. 1600 for "1.6". */
  engineCc?: number
  /** Engine name / code fragment, e.g. "hdi", "9hz". */
  engine?: string
  categoryId?: string
  condition?: PartCondition
  brandId?: string
  availability?: Availability
  reference?: string
  /** OE (original equipment) number; also matches cross references. */
  oe?: string
  limit?: number
  offset?: number
}

/** Vehicle part of a search (ids from the vehicle tables). */
export type VehicleQuery = Pick<
  CatalogSearchParams,
  'makeId' | 'modelId' | 'variantId' | 'year' | 'fuel' | 'engineCc' | 'engine'
>

export interface CatalogSearchResult {
  /** Matches (capped at 1000 by catalog_search when total_capped is true). */
  total: number
  total_capped?: boolean
  /** Normalised search terms the database used. */
  terms: string[]
  items: CatalogItem[]
}

/** A vehicle identified by VIN / plate (only providers that really offer it). */
export interface VehicleMatch {
  make: string
  model: string | null
  variant: string | null
  year: number | null
  engine_code: string | null
  fuel: Fuel | null
  /** Ids in EuroCargo's vehicle tables when the vehicle exists there. */
  makeId?: string
  modelId?: string
  variantId?: string
}

export interface VehicleLookupResult {
  /** False when no configured provider offers this lookup. */
  supported: boolean
  vehicles: VehicleMatch[]
}

/** Make / model / variant with names, for one vehicle selection. */
export interface VehicleDetail {
  make: VehicleMake
  model: VehicleModel | null
  variant: VehicleVariant | null
}

// ── Admin-only (never returned to customers) ──

export interface Supplier {
  id: string
  name: string
  /** Higher = chosen first by the "preferred" strategy (20261004). */
  priority?: number
  preferred?: boolean
  email: string | null
  phone: string | null
  country: string | null
  website: string | null
  notes: string | null
  is_demo: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierProduct {
  id: string
  supplier_id: string
  product_id: string
  supplier_sku: string | null
  cost_price: number | null
  currency: string
  stock_quantity: number | null
  lead_time_days: number | null
  condition: PartCondition | null
  availability: Availability
  active: boolean
  last_synced_at: string | null
  /** Internal link to the item at the supplier (20261002). */
  source_url?: string | null
  external_id?: string | null
  notes?: string | null
}

export const CATALOG_CAPABILITIES = [
  'search',
  'reference',
  'oe',
  'vehicle',
  'vin',
  'plate',
  'images',
  'compatibility',
  'sync',
] as const
export type CatalogCapability = (typeof CATALOG_CAPABILITIES)[number]

export const CATALOG_SOURCE_KINDS = ['file', 'rest', 'tecdoc', 'other'] as const
export const CATALOG_SOURCE_MODES = ['import', 'live', 'both'] as const

/** A catalogue provider / data source (admin only; credentials are never stored here). */
export interface CatalogSource {
  id: string
  key: string
  name: string
  kind: (typeof CATALOG_SOURCE_KINDS)[number]
  mode: (typeof CATALOG_SOURCE_MODES)[number]
  enabled: boolean
  priority: number
  adapter: string | null
  capabilities: CatalogCapability[]
  supplier_id: string | null
  default_condition: PartCondition | null
  default_currency: string | null
  image_license: string | null
  config: Record<string, unknown>
  cache_ttl_minutes: number
  sync_cursor: string | null
  last_sync_at: string | null
  last_sync_status: 'ok' | 'partial' | 'failed' | null
  last_sync_message: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Public view of the enabled sources (catalog_public_config()). */
export interface CatalogPublicConfig {
  /** Enabled sources: kinds and capabilities only (no keys, which could name a supplier). */
  sources: { kind: CatalogSource['kind']; mode: CatalogSource['mode']; capabilities: CatalogCapability[] }[]
}

export const IMPORT_MODES = ['upsert', 'insert_only', 'update_only'] as const
export type ImportMode = (typeof IMPORT_MODES)[number]
export type ImportFormat = 'csv' | 'json' | 'xml' | 'api'

export interface ImportBatch {
  id: string
  source_id: string | null
  data_source: string
  format: ImportFormat
  file_name: string | null
  mode: ImportMode
  status: 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
  total_rows: number
  inserted: number
  updated: number
  skipped: number
  failed: number
  errors: { row: number; error: string }[]
  started_at: string
  finished_at: string | null
}

/** Result of admin_catalog_import_rows() for one chunk. */
export interface ImportChunkResult {
  inserted: number
  updated: number
  skipped: number
  failed: number
  errors: { row: number; error: string }[]
  warnings: { row: number; warnings: string[] }[]
}

export const PRICE_RULE_SCOPES = ['product', 'supplier', 'category', 'condition', 'price_band', 'global'] as const
export type PriceRuleScope = (typeof PRICE_RULE_SCOPES)[number]

export interface PriceRule {
  id: string
  name: string
  scope: PriceRuleScope
  product_id: string | null
  supplier_id: string | null
  category_id: string | null
  condition: PartCondition | null
  min_cost: number | null
  max_cost: number | null
  margin_percent: number
  fixed_amount: number
  priority: number
  is_demo: boolean
  active: boolean
  created_at: string
}

export interface PriceHistoryEntry {
  id: string
  product_id: string
  old_price: number | null
  new_price: number | null
  cost_price: number | null
  reason: string
  created_at: string
}

/** Result of admin_recalculate_price(). */
export interface PriceCalculation {
  product_id: string
  cost: number
  currency: string
  supplier_id: string
  rule_id: string
  rule_name: string
  margin_percent: number
  fixed_amount: number
  old_price: number | null
  price: number
  applied: boolean
}

export interface AiSearchLog {
  id: string
  user_id: string | null
  query: string
  parsed: Record<string, unknown>
  results_count: number
  matched: boolean
  provider: string
  created_at: string
}
