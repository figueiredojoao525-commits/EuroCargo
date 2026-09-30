import { getSupabase } from '../../lib/supabase'
import type {
  CatalogSearchParams,
  CatalogSearchResult,
  PartCategory,
  ProductDetail,
  VehicleMake,
  VehicleModel,
} from '../../types'
import type { CatalogProvider } from './types'

const PRODUCT_SELECT = `*, brand:brands(name), category:part_categories(id, slug, name, name_i18n),
  product_images(*),
  product_vehicle_compatibility(*, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name))`

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

/** Clears cached reference lists (after admin edits). */
export function clearCatalogCache() {
  cache.clear()
}

function sortImages(product: ProductDetail): ProductDetail {
  return { ...product, product_images: [...product.product_images].sort((a, b) => a.position - b.position) }
}

/** EuroCargo's own catalogue in Supabase. Only public (active) data is readable here. */
export const localCatalogProvider: CatalogProvider = {
  name: 'local',

  async search(params: CatalogSearchParams): Promise<CatalogSearchResult> {
    const { data, error } = await getSupabase().rpc('search_products', {
      p_query: params.query?.trim() || null,
      p_make_id: params.makeId || null,
      p_model_id: params.modelId || null,
      p_year: params.year ?? null,
      p_category_id: params.categoryId || null,
      p_condition: params.condition ?? null,
      p_brand_id: params.brandId || null,
      p_reference: params.reference?.trim() || null,
      p_limit: params.limit ?? 24,
      p_offset: params.offset ?? 0,
    })
    if (error) throw error
    return data as CatalogSearchResult
  },

  async getProduct(id: string): Promise<ProductDetail | null> {
    const { data, error } = await getSupabase().from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle()
    if (error) throw error
    return data ? sortImages(data as ProductDetail) : null
  },

  async getAlternatives(product): Promise<ProductDetail[]> {
    if (!product.group_key) return []
    const { data, error } = await getSupabase()
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('group_key', product.group_key)
      .eq('active', true)
      .neq('id', product.id)
      .limit(6)
    if (error) throw error
    return (data as ProductDetail[]).map(sortImages)
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
      const { data, error } = await getSupabase().from('vehicle_makes').select('*').eq('active', true).order('name')
      if (error) throw error
      return data as VehicleMake[]
    })
  },

  listModels(makeId?: string): Promise<VehicleModel[]> {
    return cached(`models:${makeId ?? '*'}`, async () => {
      let query = getSupabase().from('vehicle_models').select('*').eq('active', true).order('name')
      if (makeId) query = query.eq('make_id', makeId)
      const { data, error } = await query
      if (error) throw error
      return data as VehicleModel[]
    })
  },
}
