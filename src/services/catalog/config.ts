import { getSupabase } from '../../lib/supabase'
import type { CatalogPublicConfig } from '../../types'

const EMPTY: CatalogPublicConfig = { sources: [] }
const TTL_MS = 5 * 60_000

let loaded: { at: number; config: Promise<CatalogPublicConfig> } | null = null

/**
 * Enabled catalogue sources, as set in Admin → Catálogo → Providers (catalog_public_config()).
 * Lets admins switch providers on/off without rebuilding the website. Cached for 5 minutes;
 * empty while the 20261002 migration is not applied or Supabase is unreachable.
 */
export function loadPublicConfig(): Promise<CatalogPublicConfig> {
  if (loaded && Date.now() - loaded.at < TTL_MS) return loaded.config
  const config = (async () => {
    try {
      const { data, error } = await getSupabase().rpc('catalog_public_config')
      if (error || !data) return EMPTY
      return data as CatalogPublicConfig
    } catch {
      return EMPTY
    }
  })()
  loaded = { at: Date.now(), config }
  return config
}

export function clearPublicConfig() {
  loaded = null
}

/** True when an enabled source is queried live (catalog-external). */
export async function hasLiveSource(): Promise<boolean> {
  const { sources } = await loadPublicConfig()
  return sources.some((s) => s.mode !== 'import' && s.kind !== 'file')
}
