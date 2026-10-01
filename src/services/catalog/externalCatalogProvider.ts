import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'
import type {
  CatalogCapability,
  CatalogSearchParams,
  CatalogSearchResult,
  VehicleLookupResult,
} from '../../types'
import { loadPublicConfig } from './config'
import { localCatalogProvider } from './localCatalogProvider'
import { CatalogNotConfiguredError, NO_LOOKUP, type CatalogProvider } from './types'

/**
 * Licensed external catalogue (TecDoc / TecAlliance or another provider), proxied by
 * the `catalog-external` Edge Function. The browser never sees the provider's API key
 * nor calls its API.
 *
 * The function stores what the provider returns in EuroCargo's tables (same importer
 * as the admin bulk import) and answers with catalog_search() rows, so product pages,
 * prices (pricing rules), cart and orders keep working on local ids. That is why every
 * read by id is served by the local provider.
 *
 * Until the function is deployed and a provider configured, calls throw
 * CatalogNotConfiguredError and the router falls back to the local catalogue.
 */
async function invoke<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>('catalog-external', { body: { action, ...payload } })
  if (error) {
    const status = error instanceof FunctionsHttpError ? error.context.status : 0
    if (status === 0 || status === 404 || status === 503) throw new CatalogNotConfiguredError()
    throw error
  }
  return data as T
}

const search = (params: CatalogSearchParams) => invoke<CatalogSearchResult>('search', { params })

/** Capabilities of the enabled live/both sources (from catalog_public_config()). */
async function externalCapabilities(): Promise<ReadonlySet<CatalogCapability>> {
  const config = await loadPublicConfig()
  return new Set(
    config.sources.filter((s) => s.mode !== 'import' && s.kind !== 'file').flatMap((s) => s.capabilities),
  )
}

async function lookup(capability: 'vin' | 'plate', payload: Record<string, unknown>): Promise<VehicleLookupResult> {
  if (!(await externalCapabilities()).has(capability)) return NO_LOOKUP
  return invoke<VehicleLookupResult>(capability, payload)
}

export const externalCatalogProvider: CatalogProvider = {
  name: 'external',
  capabilities: externalCapabilities,

  searchProducts: search,
  searchByReference: (reference, options = {}) => search({ ...options, reference }),
  searchByOE: (oe, options = {}) => search({ ...options, oe }),
  searchByVehicle: (vehicle, options = {}) => search({ ...options, ...vehicle }),
  searchByVIN: (vin) => lookup('vin', { vin }),
  searchByPlate: (plate, country) => lookup('plate', { plate, country }),

  // Records fetched from the provider are stored locally: reads by id are local.
  getProduct: (id) => localCatalogProvider.getProduct(id),
  getAlternatives: (product) => localCatalogProvider.getAlternatives(product),
  getCompatibility: (id) => localCatalogProvider.getCompatibility(id),
  getProductImages: (id) => localCatalogProvider.getProductImages(id),
  getVehicle: (ids) => localCatalogProvider.getVehicle(ids),
  listCategories: () => localCatalogProvider.listCategories(),
  listMakes: () => localCatalogProvider.listMakes(),
  listModels: (makeId) => localCatalogProvider.listModels(makeId),
  listVariants: (modelId) => localCatalogProvider.listVariants(modelId),
}
