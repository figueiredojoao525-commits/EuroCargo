import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'
import type { CatalogSearchParams, CatalogSearchResult, ProductDetail } from '../../types'
import { localCatalogProvider } from './localCatalogProvider'
import { CatalogNotConfiguredError, type CatalogProvider } from './types'

/**
 * Licensed external catalogue (TecDoc / TecAlliance or similar), proxied by the
 * `catalog-external` Edge Function. The browser never sees the provider's API key.
 *
 * Only search and product lookups go external; reference lists (categories,
 * vehicles) still come from the local tables, which an import job can fill.
 * Until the Edge Function is deployed and configured, every call throws
 * CatalogNotConfiguredError and the app falls back to the local catalogue.
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

export const externalCatalogProvider: CatalogProvider = {
  name: 'external',
  search: (params: CatalogSearchParams) => invoke<CatalogSearchResult>('search', { params }),
  getProduct: (id: string) => invoke<ProductDetail | null>('product', { id }),
  getAlternatives: (product) =>
    invoke<ProductDetail[]>('alternatives', { id: product.id, group_key: product.group_key }),
  listCategories: () => localCatalogProvider.listCategories(),
  listMakes: () => localCatalogProvider.listMakes(),
  listModels: (makeId?: string) => localCatalogProvider.listModels(makeId),
}
