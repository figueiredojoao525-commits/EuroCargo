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

export interface VehicleMake {
  id: string
  name: string
  slug: string
  active: boolean
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
}

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
  /** Public price; null = price on request. */
  price: number | null
  currency: string
  price_mode: 'manual' | 'rules'
  availability: Availability
  stock_quantity: number | null
  lead_time_days: number | null
  specs: Record<string, string>
  data_source: string
  source_updated_at: string | null
  is_demo: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProductImage {
  id: string
  product_id: string
  url: string
  alt: string | null
  position: number
  source: string | null
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
  source: string
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
  data_source: string
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
  year?: number
  categoryId?: string
  condition?: PartCondition
  brandId?: string
  reference?: string
  limit?: number
  offset?: number
}

export interface CatalogSearchResult {
  total: number
  /** Normalised search terms the database used. */
  terms: string[]
  items: CatalogItem[]
}

// ── Admin-only (never returned to customers) ──

export interface Supplier {
  id: string
  name: string
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
