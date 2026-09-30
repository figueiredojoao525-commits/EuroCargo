import { externalCatalogProvider } from './externalCatalogProvider'
import { localCatalogProvider } from './localCatalogProvider'
import { CatalogNotConfiguredError, type CatalogProvider } from './types'

export { clearCatalogCache } from './localCatalogProvider'
export { CatalogNotConfiguredError, type CatalogProvider } from './types'

/**
 * VITE_CATALOG_PROVIDER=external uses the licensed catalogue first and falls back to
 * the local one while it is not configured. Default: local.
 */
function withFallback(primary: CatalogProvider, fallback: CatalogProvider): CatalogProvider {
  const attempt =
    <A extends unknown[], R>(pick: (p: CatalogProvider) => (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await pick(primary)(...args)
      } catch (error) {
        if (error instanceof CatalogNotConfiguredError) return pick(fallback)(...args)
        throw error
      }
    }
  return {
    name: `${primary.name}+${fallback.name}`,
    search: attempt((p) => p.search),
    getProduct: attempt((p) => p.getProduct),
    getAlternatives: attempt((p) => p.getAlternatives),
    listCategories: attempt((p) => p.listCategories),
    listMakes: attempt((p) => p.listMakes),
    listModels: attempt((p) => p.listModels),
  }
}

export const catalogProvider: CatalogProvider =
  import.meta.env.VITE_CATALOG_PROVIDER === 'external'
    ? withFallback(externalCatalogProvider, localCatalogProvider)
    : localCatalogProvider
