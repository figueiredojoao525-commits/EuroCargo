import type {
  CatalogCapability,
  CatalogSearchParams,
  CatalogSearchResult,
  CompatibilityWithNames,
  PartCategory,
  ProductDetail,
  ProductImage,
  VehicleDetail,
  VehicleLookupResult,
  VehicleMake,
  VehicleModel,
  VehicleQuery,
  VehicleVariant,
} from '../../types'

/** Search options shared by the specialised lookups (filters + pagination). */
export type SearchOptions = Omit<CatalogSearchParams, 'reference' | 'oe'>

/**
 * Source of catalogue data for the shop, the assistant and the admin pickers.
 * The UI only talks to this interface, never to a supplier or catalogue API.
 *
 * - LocalCatalogProvider: EuroCargo's own tables in Supabase (products added by
 *   admins, supplier feeds and licensed data imported server-side, demo data).
 * - ExternalCatalogProvider: a licensed catalogue (TecDoc / TecAlliance or other)
 *   reached ONLY through the `catalog-external` Edge Function, which holds the
 *   credentials and stores what it fetches in the local tables (so prices come
 *   from the pricing rules and products can be ordered like any other).
 * - The TecDoc adapter itself lives server-side:
 *   supabase/functions/_shared/catalog/adapters/tecdoc.ts. See docs/catalog-and-ai.md.
 */
export interface CatalogProvider {
  readonly name: string
  /** What this provider can answer (VIN / plate lookups only when a provider really offers them). */
  capabilities(): Promise<ReadonlySet<CatalogCapability>>

  searchProducts(params: CatalogSearchParams): Promise<CatalogSearchResult>
  getProduct(id: string): Promise<ProductDetail | null>
  /** Manufacturer part number, EAN or any public reference. */
  searchByReference(reference: string, options?: SearchOptions): Promise<CatalogSearchResult>
  /** Original-equipment number (also matches cross references). */
  searchByOE(oe: string, options?: SearchOptions): Promise<CatalogSearchResult>
  searchByVehicle(vehicle: VehicleQuery, options?: SearchOptions): Promise<CatalogSearchResult>
  searchByVIN(vin: string): Promise<VehicleLookupResult>
  searchByPlate(plate: string, country: string): Promise<VehicleLookupResult>
  getVehicle(ids: { makeId: string; modelId?: string; variantId?: string }): Promise<VehicleDetail | null>
  getCompatibility(productId: string): Promise<CompatibilityWithNames[]>
  getProductImages(productId: string): Promise<ProductImage[]>
  /** Same part in other conditions (e.g. the used version of a new part). */
  getAlternatives(product: Pick<ProductDetail, 'id' | 'group_key'>): Promise<ProductDetail[]>

  listCategories(): Promise<PartCategory[]>
  listMakes(): Promise<VehicleMake[]>
  listModels(makeId?: string): Promise<VehicleModel[]>
  listVariants(modelId: string): Promise<VehicleVariant[]>
}

/** The provider (or its Edge Function) is not configured / not deployed: callers fall back. */
export class CatalogNotConfiguredError extends Error {
  constructor() {
    super('catalog_not_configured')
  }
}

export const NO_LOOKUP: VehicleLookupResult = { supported: false, vehicles: [] }
