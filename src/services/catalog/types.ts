import type {
  CatalogSearchParams,
  CatalogSearchResult,
  PartCategory,
  ProductDetail,
  VehicleMake,
  VehicleModel,
} from '../../types'

/**
 * Source of catalogue data for the shop and the assistant.
 *
 * - LocalCatalogProvider: EuroCargo's own tables in Supabase (products added by
 *   admins, supplier feeds imported server-side, demo data).
 * - ExternalCatalogProvider: a licensed catalogue (e.g. TecDoc / TecAlliance)
 *   reached ONLY through a Supabase Edge Function, so its credentials never
 *   reach the browser. See docs/catalog-and-ai.md.
 */
export interface CatalogProvider {
  readonly name: string
  search(params: CatalogSearchParams): Promise<CatalogSearchResult>
  getProduct(id: string): Promise<ProductDetail | null>
  /** Same part in other conditions (e.g. the used version of a new part). */
  getAlternatives(product: Pick<ProductDetail, 'id' | 'group_key'>): Promise<ProductDetail[]>
  listCategories(): Promise<PartCategory[]>
  listMakes(): Promise<VehicleMake[]>
  listModels(makeId?: string): Promise<VehicleModel[]>
}

export class CatalogNotConfiguredError extends Error {
  constructor() {
    super('catalog_not_configured')
  }
}
