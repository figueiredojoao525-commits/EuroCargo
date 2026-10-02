import type { CatalogCapability } from '../../types'
import { clearPublicConfig, hasLiveSource } from './config'
import { externalCatalogProvider } from './externalCatalogProvider'
import { clearCatalogCache as clearLocalCache, localCatalogProvider } from './localCatalogProvider'
import { CatalogNotConfiguredError, type CatalogProvider } from './types'

export { CatalogNotConfiguredError, type CatalogProvider, type SearchOptions } from './types'
export { loadPublicConfig } from './config'

/** Clears cached reference lists, searches and provider configuration (after admin edits / imports). */
export function clearCatalogCache() {
  clearLocalCache()
  clearPublicConfig()
}

/**
 * Picks the provider for each call:
 * - VITE_CATALOG_PROVIDER=local    → always the local catalogue;
 * - VITE_CATALOG_PROVIDER=external → the licensed catalogue first;
 * - unset / auto (default)         → the licensed catalogue only while an admin has a live
 *   source enabled in Admin → Catálogo → Providers (no rebuild needed).
 * Whenever the external side is not configured, the local catalogue answers instead.
 */
const mode = import.meta.env.VITE_CATALOG_PROVIDER ?? 'auto'

/** True while searches go to the external / licensed catalogue instead of the local tables. */
export async function externalEnabled(): Promise<boolean> {
  if (mode === 'local') return false
  if (mode === 'external') return true
  return hasLiveSource()
}

type Method = Exclude<keyof CatalogProvider, 'name' | 'capabilities'>

function routed<K extends Method>(method: K): CatalogProvider[K] {
  const call = async (...args: unknown[]) => {
    const local = localCatalogProvider[method] as (...a: unknown[]) => Promise<unknown>
    if (!(await externalEnabled())) return local(...args)
    try {
      return await (externalCatalogProvider[method] as (...a: unknown[]) => Promise<unknown>)(...args)
    } catch (error) {
      if (error instanceof CatalogNotConfiguredError) return local(...args)
      throw error
    }
  }
  return call as CatalogProvider[K]
}

export const catalogProvider: CatalogProvider = {
  name: mode === 'local' ? 'local' : 'external+local',
  async capabilities() {
    const all = new Set<CatalogCapability>(await localCatalogProvider.capabilities())
    if (await externalEnabled()) for (const c of await externalCatalogProvider.capabilities()) all.add(c)
    return all
  },
  searchProducts: routed('searchProducts'),
  getProduct: routed('getProduct'),
  searchByReference: routed('searchByReference'),
  searchByOE: routed('searchByOE'),
  searchByVehicle: routed('searchByVehicle'),
  searchByVIN: routed('searchByVIN'),
  searchByPlate: routed('searchByPlate'),
  getVehicle: routed('getVehicle'),
  getCompatibility: routed('getCompatibility'),
  getProductImages: routed('getProductImages'),
  getAlternatives: routed('getAlternatives'),
  listCategories: routed('listCategories'),
  listMakes: routed('listMakes'),
  listModels: routed('listModels'),
  listVariants: routed('listVariants'),
}
