// Admin catalogue, supplier and pricing management. Every write is authorised in
// the database (RLS "admin all" policies / is_admin() in functions).
import { getSupabase } from '../lib/supabase'
import type {
  AiSearchLog,
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

export const ADMIN_LIST_SIZE = 25

type Row = Record<string, unknown>

async function list<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const { data, error } = await getSupabase().from(table).select('*').order(order, { ascending })
  if (error) throw error
  return data as T[]
}

/** Insert when there is no id, update otherwise. Returns the saved row. */
async function save<T>(table: string, row: Row, id?: string): Promise<T> {
  const query = id
    ? getSupabase().from(table).update(row).eq('id', id).select().single()
    : getSupabase().from(table).insert(row).select().single()
  const { data, error } = await query
  if (error) throw error
  clearCatalogCache()
  return data as T
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
  let query = getSupabase()
    .from('products')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(page * ADMIN_LIST_SIZE, (page + 1) * ADMIN_LIST_SIZE - 1)
  const text = filters.text
    .trim()
    .toLowerCase()
    .replace(/[%_,()]/g, ' ')
  if (text) query = query.ilike('search_text', `%${text}%`)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.condition) query = query.eq('condition', filters.condition)
  if (filters.active) query = query.eq('active', filters.active === 'true')
  const { data, error, count } = await query
  if (error) throw error
  return { rows: data as Product[], total: count ?? 0 }
}

export async function getProductForAdmin(id: string) {
  const supabase = getSupabase()
  const [product, images, compat, suppliers, history] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('product_images').select('*').eq('product_id', id).order('position'),
    supabase
      .from('product_vehicle_compatibility')
      .select('*, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name)')
      .eq('product_id', id)
      .order('created_at'),
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
    compatibility: compat.data as CompatibilityWithNames[],
    supplierProducts: suppliers.data as SupplierProduct[],
    history: history.data as PriceHistoryEntry[],
  }
}

export const saveProduct = (row: Row, id?: string) => save<Product>('products', row, id)
export const deleteProduct = (id: string) => remove('products', id)

export const saveImage = (row: Row, id?: string) => save<ProductImage>('product_images', row, id)
export const deleteImage = (id: string) => remove('product_images', id)

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

export const listMakesAdmin = () => list<VehicleMake>('vehicle_makes', 'name')
export const saveMake = (row: Row, id?: string) => save<VehicleMake>('vehicle_makes', row, id)
export const deleteMake = (id: string) => remove('vehicle_makes', id)

export const listModelsAdmin = () => list<VehicleModel>('vehicle_models', 'name')
export const saveModel = (row: Row, id?: string) => save<VehicleModel>('vehicle_models', row, id)
export const deleteModel = (id: string) => remove('vehicle_models', id)

export const listVariantsAdmin = () => list<VehicleVariant>('vehicle_variants', 'name')
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
