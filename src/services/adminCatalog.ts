// Admin catalogue, supplier and pricing management. Every write is authorised in
// the database (RLS "admin all" policies / is_admin() in functions).
import { getSupabase } from '../lib/supabase'
import type {
  AiSearchLog,
  Availability,
  Brand,
  Compatibility,
  CompatibilityWithNames,
  PartCategory,
  PriceCalculation,
  PriceHistoryEntry,
  PriceRule,
  Product,
  ProductImage,
  Supplier,
  SupplierProduct,
  VehicleMake,
  VehicleModel,
  VehicleVariant,
} from '../types'
import { clearCatalogCache } from './catalog'
import { COMPATIBILITY_WITH_NAMES, IMAGE_COLUMNS, MAKE_COLUMNS, MODEL_COLUMNS, VARIANT_COLUMNS } from './catalog/columns'

export const ADMIN_LIST_SIZE = 25

type Row = Record<string, unknown>

async function list<T>(table: string, order: string, ascending = true, columns = '*'): Promise<T[]> {
  const { data, error } = await getSupabase().from(table).select(columns).order(order, { ascending })
  if (error) throw error
  return data as T[]
}

/**
 * Insert when there is no id, update otherwise. Returns the saved row's id: catalogue tables
 * have internal columns the browser cannot read back (callers reload what they display).
 */
async function save<T>(table: string, row: Row, id?: string): Promise<T> {
  const query = id
    ? getSupabase().from(table).update(row).eq('id', id).select('id').single()
    : getSupabase().from(table).insert(row).select('id').single()
  const { data, error } = await query
  if (error) throw error
  clearCatalogCache()
  return data as T
}

/** PostgREST: relation not found (migration 20261004 not applied yet). */
const isMissingRelation = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01'

// Internal product columns are only readable through the admin_products view (admins only).
let productsSource: 'admin_products' | 'products' = 'admin_products'
async function adminProductsQuery<R extends { error: { code?: string } | null }>(
  build: (table: string) => PromiseLike<R>,
): Promise<R> {
  let result = await build(productsSource)
  if (result.error && isMissingRelation(result.error) && productsSource === 'admin_products') {
    productsSource = 'products'
    result = await build(productsSource)
  }
  return result
}

/** Drops the given keys when empty (columns added by a later migration are only sent when used). */
export function withoutEmpty(row: Row, ...keys: string[]): Row {
  const copy = { ...row }
  for (const key of keys) if (copy[key] === null || copy[key] === undefined || copy[key] === '') delete copy[key]
  return copy
}

async function remove(table: string, id: string): Promise<void> {
  const { error } = await getSupabase().from(table).delete().eq('id', id)
  if (error) throw error
  clearCatalogCache()
}

// ── Products ──
export interface ProductFilters {
  text: string
  categoryId: string
  condition: '' | 'new' | 'used'
  active: '' | 'true' | 'false'
}

export const EMPTY_PRODUCT_FILTERS: ProductFilters = { text: '', categoryId: '', condition: '', active: '' }

export async function listProducts(filters: ProductFilters, page: number): Promise<{ rows: Product[]; total: number }> {
  const text = filters.text
    .trim()
    .toLowerCase()
    .replace(/[%_,()]/g, ' ')
  const { data, error, count } = await adminProductsQuery((table) => {
    let query = getSupabase()
      .from(table)
      // Exact counts get slow on very large catalogues; 'estimated' is exact for small results.
      .select('*', { count: 'estimated' })
      .order('updated_at', { ascending: false })
      .range(page * ADMIN_LIST_SIZE, (page + 1) * ADMIN_LIST_SIZE - 1)
    if (text) query = query.ilike('search_text', `%${text}%`)
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
    if (filters.condition) query = query.eq('condition', filters.condition)
    if (filters.active) query = query.eq('active', filters.active === 'true')
    return query
  })
  if (error) throw error
  return { rows: data as Product[], total: count ?? 0 }
}

export async function getProductForAdmin(id: string) {
  const supabase = getSupabase()
  const [product, images, compat, suppliers, history] = await Promise.all([
    adminProductsQuery((table) => supabase.from(table).select('*').eq('id', id).maybeSingle()),
    supabase.from('product_images').select(IMAGE_COLUMNS).eq('product_id', id).order('position'),
    supabase.from('product_vehicle_compatibility').select(COMPATIBILITY_WITH_NAMES).eq('product_id', id).order('created_at'),
    supabase.from('supplier_products').select('*').eq('product_id', id).order('created_at'),
    supabase
      .from('product_price_history')
      .select('*')
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  for (const r of [product, images, compat, suppliers, history]) if (r.error) throw r.error
  if (!product.data) return null
  return {
    product: product.data as Product,
    images: images.data as ProductImage[],
    compatibility: compat.data as unknown as CompatibilityWithNames[],
    supplierProducts: suppliers.data as SupplierProduct[],
    history: history.data as PriceHistoryEntry[],
  }
}

export const saveProduct = (row: Row, id?: string) => save<Product>('products', row, id)
export const deleteProduct = (id: string) => remove('products', id)

export const saveImage = (row: Row, id?: string) => save<ProductImage>('product_images', row, id)
export const deleteImage = (id: string) => remove('product_images', id)

/** Main image of a product (one per product: the previous one is unset first). */
export async function setPrimaryImage(productId: string, imageId: string): Promise<void> {
  const supabase = getSupabase()
  const unset = await supabase
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId)
    .eq('is_primary', true)
  if (unset.error) throw unset.error
  const set = await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId)
  if (set.error) throw set.error
  clearCatalogCache()
}

/** Uploads a photo to the public `product-images` bucket and returns its public URL. */
export async function uploadProductImage(productId: string, file: File): Promise<string> {
  const extension =
    file.name
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${productId}/${crypto.randomUUID()}.${extension}`
  const storage = getSupabase().storage.from('product-images')
  const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return storage.getPublicUrl(path).data.publicUrl
}

export const saveCompatibility = (row: Row, id?: string) =>
  save<Compatibility>('product_vehicle_compatibility', row, id)
export const deleteCompatibility = (id: string) => remove('product_vehicle_compatibility', id)

export const saveSupplierProduct = (row: Row, id?: string) => save<SupplierProduct>('supplier_products', row, id)
export const deleteSupplierProduct = (id: string) => remove('supplier_products', id)

// ── Reference data ──
export const listBrands = () => list<Brand>('brands', 'name')
export const saveBrand = (row: Row, id?: string) => save<Brand>('brands', row, id)
export const deleteBrand = (id: string) => remove('brands', id)

export const listCategoriesAdmin = () => list<PartCategory>('part_categories', 'position')
export const saveCategory = (row: Row, id?: string) => save<PartCategory>('part_categories', row, id)
export const deleteCategory = (id: string) => remove('part_categories', id)

export const listMakesAdmin = () => list<VehicleMake>('vehicle_makes', 'name', true, MAKE_COLUMNS)
export const saveMake = (row: Row, id?: string) => save<VehicleMake>('vehicle_makes', row, id)
export const deleteMake = (id: string) => remove('vehicle_makes', id)

/** Models of one make (a full vehicle tree can have thousands of models). */
export async function listModelsAdmin(makeId?: string): Promise<VehicleModel[]> {
  let query = getSupabase().from('vehicle_models').select(MODEL_COLUMNS).order('name').limit(1000)
  if (makeId) query = query.eq('make_id', makeId)
  const { data, error } = await query
  if (error) throw error
  return data as VehicleModel[]
}
export const saveModel = (row: Row, id?: string) => save<VehicleModel>('vehicle_models', row, id)
export const deleteModel = (id: string) => remove('vehicle_models', id)

/** Engine versions of one model. */
export async function listVariantsAdmin(modelId?: string): Promise<VehicleVariant[]> {
  let query = getSupabase().from('vehicle_variants').select(VARIANT_COLUMNS).order('name').limit(1000)
  if (modelId) query = query.eq('model_id', modelId)
  const { data, error } = await query
  if (error) throw error
  return data as VehicleVariant[]
}
export const saveVariant = (row: Row, id?: string) => save<VehicleVariant>('vehicle_variants', row, id)
export const deleteVariant = (id: string) => remove('vehicle_variants', id)

// ── Suppliers ──
export const listSuppliers = () => list<Supplier>('suppliers', 'name')
export const saveSupplier = (row: Row, id?: string) => save<Supplier>('suppliers', row, id)
export const deleteSupplier = (id: string) => remove('suppliers', id)

// ── Pricing ──
export const listPriceRules = () => list<PriceRule>('price_rules', 'created_at')
export const savePriceRule = (row: Row, id?: string) => save<PriceRule>('price_rules', row, id)
export const deletePriceRule = (id: string) => remove('price_rules', id)

export async function recalculatePrice(productId: string, apply: boolean): Promise<PriceCalculation> {
  const { data, error } = await getSupabase().rpc('admin_recalculate_price', {
    p_product_id: productId,
    p_apply: apply,
  })
  if (error) throw error
  return data as PriceCalculation
}

export async function recalculateAllPrices(): Promise<{ updated: number; skipped: number }> {
  const { data, error } = await getSupabase().rpc('admin_recalculate_all_prices')
  if (error) throw error
  return data as { updated: number; skipped: number }
}

export async function purgeDemoData(): Promise<{ products: number; suppliers: number; rules: number; brands: number }> {
  const { data, error } = await getSupabase().rpc('admin_purge_demo_data')
  if (error) throw error
  clearCatalogCache()
  return data as { products: number; suppliers: number; rules: number; brands: number }
}

// ── Assistant logs ──
export async function listAiLogs(
  onlyUnmatched: boolean,
  page: number,
): Promise<{ rows: AiSearchLog[]; total: number }> {
  let query = getSupabase()
    .from('ai_search_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * ADMIN_LIST_SIZE, (page + 1) * ADMIN_LIST_SIZE - 1)
  if (onlyUnmatched) query = query.eq('matched', false)
  const { data, error, count } = await query
  if (error) throw error
  return { rows: data as AiSearchLog[], total: count ?? 0 }
}

// ── Internal supplier offers (admin only) ──
export const OFFER_STRATEGIES = ['cheapest', 'stock', 'fastest', 'preferred'] as const
export type OfferStrategy = (typeof OFFER_STRATEGIES)[number]

export interface ProductOffer {
  id: string
  supplier_id: string
  supplier_name: string
  supplier_active: boolean
  supplier_is_demo: boolean
  preferred: boolean
  priority: number
  supplier_sku: string | null
  external_id: string | null
  cost_price: number | null
  currency: string
  stock_quantity: number | null
  availability: Availability
  lead_time_days: number | null
  in_stock: boolean
  active: boolean
  last_synced_at: string | null
  source_url: string | null
  /** The offer the system chose (it defines availability and the EuroCargo price). */
  selected: boolean
  rule_name: string | null
  margin_percent: number | null
  fixed_amount: number | null
  /** EuroCargo price this offer would give with its pricing rule. */
  price: number | null
}

export interface ProductOffers {
  strategy: OfferStrategy
  selected_supplier_id: string | null
  price_mode: 'manual' | 'rules'
  price: number | null
  currency: string
  availability: Availability
  stock_quantity: number | null
  lead_time_days: number | null
  offers: ProductOffer[]
}

/** Product → every internal offer (supplier, cost, stock, lead time, margin, EuroCargo price). */
export async function getProductOffers(productId: string): Promise<ProductOffers | null> {
  const { data, error } = await getSupabase().rpc('admin_product_offers', { p_product_id: productId })
  if (error) {
    if (error.code === 'PGRST202') return null // migration 20261004 not applied yet
    throw error
  }
  return data as ProductOffers
}

export async function getOfferStrategy(): Promise<OfferStrategy | null> {
  const { data, error } = await getSupabase().from('catalog_settings').select('offer_strategy').maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  return (data?.offer_strategy as OfferStrategy | undefined) ?? 'cheapest'
}

export async function saveOfferStrategy(strategy: OfferStrategy): Promise<void> {
  const { error } = await getSupabase().from('catalog_settings').update({ offer_strategy: strategy }).eq('id', true)
  if (error) throw error
}

/** Re-applies the strategy to every product with supplier offers. */
export async function refreshAllOffers(): Promise<{ products: number }> {
  const { data, error } = await getSupabase().rpc('admin_refresh_all_offers')
  if (error) throw error
  clearCatalogCache()
  return data as { products: number }
}
