import { getSupabase } from '../../lib/supabase'
import type {
  CatalogCapability,
  CatalogSearchParams,
  CatalogSearchResult,
  CompatibilityWithNames,
  PartCategory,
  ProductDetail,
  ProductImage,
  VehicleDetail,
  VehicleMake,
  VehicleModel,
  VehicleVariant,
} from '../../types'
import {
  COMPATIBILITY_WITH_NAMES,
  IMAGE_COLUMNS,
  MAKE_COLUMNS,
  MODEL_COLUMNS,
  PRODUCT_DETAIL_SELECT,
  VARIANT_COLUMNS,
} from './columns'
import { NO_LOOKUP, type CatalogProvider } from './types'

// Reference lists change rarely: cache them for the session to avoid repeated queries.
const cache = new Map<string, Promise<unknown>>()
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined
  if (!hit) {
    hit = load()
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}

// Search results: short-lived cache (back/forward navigation, pagination round trips).
const SEARCH_TTL_MS = 60_000
const SEARCH_CACHE_SIZE = 50
const searchCache = new Map<string, { at: number; result: Promise<CatalogSearchResult> }>()

/** Clears cached reference lists and searches (after admin edits / imports). */
export function clearCatalogCache() {
  cache.clear()
  searchCache.clear()
}

/** Primary image first, then by position. */
export function sortImages<T extends Pick<ProductImage, 'position'> & { is_primary?: boolean }>(images: T[]): T[] {
  return [...images].sort((a, b) => Number(b.is_primary ?? false) - Number(a.is_primary ?? false) || a.position - b.position)
}

function withSortedImages(product: ProductDetail): ProductDetail {
  return { ...product, product_images: sortImages(product.product_images) }
}

/** PostgREST "function not found": the 20261002 migration is not applied yet. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}

let catalogSearchAvailable = true

/** catalog_search() (migration 20261002), or the original search_products() while it is not applied. */
async function runSearch(params: CatalogSearchParams): Promise<CatalogSearchResult> {
  const supabase = getSupabase()
  if (catalogSearchAvailable) {
    const { data, error } = await supabase.rpc('catalog_search', {
      p_params: {
        query: params.query?.trim() || undefined,
        reference: params.reference?.trim() || undefined,
        oe: params.oe?.trim() || undefined,
        make_id: params.makeId || undefined,
        model_id: params.modelId || undefined,
        variant_id: params.variantId || undefined,
        year: params.year,
        fuel: params.fuel,
        engine_cc: params.engineCc,
        engine: params.engine || undefined,
        category_id: params.categoryId || undefined,
        condition: params.condition,
        brand_id: params.brandId || undefined,
        availability: params.availability,
        limit: params.limit ?? 24,
        offset: params.offset ?? 0,
      },
    })
    if (!error) return data as CatalogSearchResult
    if (!isMissingFunction(error)) throw error
    catalogSearchAvailable = false
  }
  const { data, error } = await supabase.rpc('search_products', {
    p_query: params.query?.trim() || null,
    p_make_id: params.makeId || null,
    p_model_id: params.modelId || null,
    p_year: params.year ?? null,
    p_category_id: params.categoryId || null,
    p_condition: params.condition ?? null,
    p_brand_id: params.brandId || null,
    p_reference: (params.reference ?? params.oe)?.trim() || null,
    p_limit: params.limit ?? 24,
    p_offset: params.offset ?? 0,
  })
  if (error) throw error
  return data as CatalogSearchResult
}

function cachedSearch(params: CatalogSearchParams): Promise<CatalogSearchResult> {
  const key = JSON.stringify(params, Object.keys(params).sort())
  const now = Date.now()
  const hit = searchCache.get(key)
  if (hit && now - hit.at < SEARCH_TTL_MS) return hit.result
  const result = runSearch(params)
  result.catch(() => searchCache.delete(key))
  searchCache.set(key, { at: now, result })
  if (searchCache.size > SEARCH_CACHE_SIZE) searchCache.delete(searchCache.keys().next().value!)
  return result
}

const LOCAL_CAPABILITIES: ReadonlySet<CatalogCapability> = new Set([
  'search',
  'reference',
  'oe',
  'vehicle',
  'images',
  'compatibility',
])

/** EuroCargo's own catalogue in Supabase. Only public (active) data is readable here. */
export const localCatalogProvider: CatalogProvider = {
  name: 'local',

  capabilities: async () => LOCAL_CAPABILITIES,

  searchProducts: (params) => cachedSearch(params),

  searchByReference: (reference, options = {}) => cachedSearch({ ...options, reference }),

  searchByOE: (oe, options = {}) => cachedSearch({ ...options, oe }),

  searchByVehicle: (vehicle, options = {}) => cachedSearch({ ...options, ...vehicle }),

  // VIN / plate decoding needs a provider that really offers it (never guessed locally).
  searchByVIN: async () => NO_LOOKUP,
  searchByPlate: async () => NO_LOOKUP,

  async getProduct(id: string): Promise<ProductDetail | null> {
    const { data, error } = await getSupabase().from('products').select(PRODUCT_DETAIL_SELECT).eq('id', id).maybeSingle()
    if (error) throw error
    return data ? withSortedImages(data as unknown as ProductDetail) : null
  },

  async getAlternatives(product): Promise<ProductDetail[]> {
    if (!product.group_key) return []
    const { data, error } = await getSupabase()
      .from('products')
      .select(PRODUCT_DETAIL_SELECT)
      .eq('group_key', product.group_key)
      .eq('active', true)
      .neq('id', product.id)
      .limit(6)
    if (error) throw error
    return (data as unknown as ProductDetail[]).map(withSortedImages)
  },

  async getCompatibility(productId: string): Promise<CompatibilityWithNames[]> {
    const { data, error } = await getSupabase()
      .from('product_vehicle_compatibility')
      .select(COMPATIBILITY_WITH_NAMES)
      .eq('product_id', productId)
      .order('created_at')
      .limit(500)
    if (error) throw error
    return data as unknown as CompatibilityWithNames[]
  },

  async getProductImages(productId: string): Promise<ProductImage[]> {
    const { data, error } = await getSupabase().from('product_images').select(IMAGE_COLUMNS).eq('product_id', productId)
    if (error) throw error
    return sortImages(data as ProductImage[])
  },

  async getVehicle({ makeId, modelId, variantId }): Promise<VehicleDetail | null> {
    const supabase = getSupabase()
    const [make, model, variant] = await Promise.all([
      supabase.from('vehicle_makes').select(MAKE_COLUMNS).eq('id', makeId).maybeSingle(),
      modelId ? supabase.from('vehicle_models').select(MODEL_COLUMNS).eq('id', modelId).maybeSingle() : null,
      variantId ? supabase.from('vehicle_variants').select(VARIANT_COLUMNS).eq('id', variantId).maybeSingle() : null,
    ])
    for (const r of [make, model, variant]) if (r?.error) throw r.error
    if (!make.data) return null
    return {
      make: make.data as VehicleMake,
      model: (model?.data as VehicleModel | null) ?? null,
      variant: (variant?.data as VehicleVariant | null) ?? null,
    }
  },

  listCategories(): Promise<PartCategory[]> {
    return cached('categories', async () => {
      const { data, error } = await getSupabase()
        .from('part_categories')
        .select('*')
        .eq('active', true)
        .order('position')
        .order('name')
      if (error) throw error
      return data as PartCategory[]
    })
  },

  listMakes(): Promise<VehicleMake[]> {
    return cached('makes', async () => {
      const { data, error } = await getSupabase().from('vehicle_makes').select(MAKE_COLUMNS).eq('active', true).order('name')
      if (error) throw error
      return data as VehicleMake[]
    })
  },

  listModels(makeId?: string): Promise<VehicleModel[]> {
    return cached(`models:${makeId ?? '*'}`, async () => {
      let query = getSupabase().from('vehicle_models').select(MODEL_COLUMNS).eq('active', true).order('name')
      if (makeId) query = query.eq('make_id', makeId)
      const { data, error } = await query
      if (error) throw error
      return data as VehicleModel[]
    })
  },

  listVariants(modelId: string): Promise<VehicleVariant[]> {
    return cached(`variants:${modelId}`, async () => {
      const { data, error } = await getSupabase()
        .from('vehicle_variants')
        .select(VARIANT_COLUMNS)
        .eq('model_id', modelId)
        .order('name')
        .limit(500)
      if (error) throw error
      return data as VehicleVariant[]
    })
  },
}
