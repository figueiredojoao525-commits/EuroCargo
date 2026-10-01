// Server-side CatalogProvider used by the Edge Functions (ai-assistant, catalog-external,
// catalog-sync). Same contract as the website's provider: functions never query catalogue
// tables directly for search — they go through catalog_search() (RLS applies with the
// caller's client) and through the importer for writes (service_role client).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { ImportRow } from './types.ts'

export interface SearchParams {
  query?: string
  reference?: string
  oe?: string
  makeId?: string
  modelId?: string
  variantId?: string
  year?: number
  fuel?: string
  engineCc?: number
  engine?: string
  categoryId?: string
  condition?: 'new' | 'used'
  brandId?: string
  limit?: number
  offset?: number
}

export interface SearchResult {
  total: number
  total_capped?: boolean
  terms: string[]
  items: { id: string; ref_match: boolean; matched_terms: number; [key: string]: unknown }[]
}

export interface VehicleName {
  id: string
  name: string
  make_id?: string
}

export interface ServerCatalog {
  searchProducts(params: SearchParams): Promise<SearchResult>
  listMakes(): Promise<VehicleName[]>
  listModels(makeId?: string): Promise<VehicleName[]>
  findVehicle(make: string, model?: string | null): Promise<{ makeId?: string; modelId?: string }>
}

/** Reads with the given client (the caller's rights when created with the caller's JWT). */
export function createServerCatalog(client: SupabaseClient): ServerCatalog {
  let catalogSearchAvailable = true

  return {
    async searchProducts(params) {
      if (catalogSearchAvailable) {
        const { data, error } = await client.rpc('catalog_search', {
          p_params: {
            query: params.query || undefined,
            reference: params.reference || undefined,
            oe: params.oe || undefined,
            make_id: params.makeId,
            model_id: params.modelId,
            variant_id: params.variantId,
            year: params.year,
            fuel: params.fuel,
            engine_cc: params.engineCc,
            engine: params.engine,
            category_id: params.categoryId,
            condition: params.condition,
            brand_id: params.brandId,
            limit: params.limit ?? 24,
            offset: params.offset ?? 0,
          },
        })
        if (!error) return data as SearchResult
        if (error.code !== 'PGRST202') throw error
        catalogSearchAvailable = false // migration 20261002 not applied yet
      }
      const { data, error } = await client.rpc('search_products', {
        p_query: params.query || null,
        p_make_id: params.makeId ?? null,
        p_model_id: params.modelId ?? null,
        p_year: params.year ?? null,
        p_category_id: params.categoryId ?? null,
        p_condition: params.condition ?? null,
        p_brand_id: params.brandId ?? null,
        p_reference: params.reference || params.oe || null,
        p_limit: params.limit ?? 24,
        p_offset: params.offset ?? 0,
      })
      if (error) throw error
      return data as SearchResult
    },

    async listMakes() {
      const { data, error } = await client.from('vehicle_makes').select('id, name').eq('active', true).order('name')
      if (error) throw error
      return data as VehicleName[]
    },

    async listModels(makeId) {
      let query = client.from('vehicle_models').select('id, name, make_id').eq('active', true).order('name').limit(1000)
      if (makeId) query = query.eq('make_id', makeId)
      const { data, error } = await query
      if (error) throw error
      return data as VehicleName[]
    },

    async findVehicle(make, model) {
      const makes = await this.listMakes()
      const m = makes.find((x) => x.name.toLowerCase() === make.toLowerCase())
      if (!m) return {}
      if (!model) return { makeId: m.id }
      const models = await this.listModels(m.id)
      const md = models.find((x) => x.name.toLowerCase() === model.toLowerCase())
      return { makeId: m.id, modelId: md?.id }
    },
  }
}

export interface ImportSummary {
  batch_id: string
  inserted: number
  updated: number
  skipped: number
  failed: number
}

/**
 * Stores provider rows through the importer (service_role client only). Same validation,
 * de-duplication, pricing rules and RLS-protected tables as the admin bulk import.
 */
export async function importRows(
  service: SupabaseClient,
  sourceId: string,
  rows: ImportRow[],
  options: { format?: 'api'; fileName?: string; syncCursor?: string | null; chunkSize?: number } = {},
): Promise<ImportSummary> {
  const { data: batchId, error: startError } = await service.rpc('catalog_import_start', {
    p_source_id: sourceId,
    p_format: options.format ?? 'api',
    p_file_name: options.fileName ?? null,
    p_mode: 'upsert',
    p_options: { create_reference_data: true },
  })
  if (startError) throw startError

  const summary: ImportSummary = { batch_id: batchId as string, inserted: 0, updated: 0, skipped: 0, failed: 0 }
  const size = options.chunkSize ?? 500
  try {
    for (let i = 0; i < rows.length; i += size) {
      const { data, error } = await service.rpc('catalog_import_rows', {
        p_batch_id: batchId,
        p_rows: rows.slice(i, i + size),
        p_row_offset: i,
      })
      if (error) throw error
      summary.inserted += data.inserted
      summary.updated += data.updated
      summary.skipped += data.skipped
      summary.failed += data.failed
    }
  } catch (error) {
    await service.rpc('catalog_import_finish', { p_batch_id: batchId, p_cancelled: true, p_sync_cursor: null })
    throw error
  }
  const { error: finishError } = await service.rpc('catalog_import_finish', {
    p_batch_id: batchId,
    p_cancelled: false,
    p_sync_cursor: options.syncCursor ?? null,
  })
  if (finishError) throw finishError
  return summary
}

export interface SourceRow {
  id: string
  key: string
  kind: string
  mode: string
  enabled: boolean
  capabilities: string[]
  config: Record<string, unknown>
  cache_ttl_minutes: number
  sync_cursor: string | null
}

/** Highest-priority enabled source of the given usage (live: catalog-external). */
export async function findSource(
  service: SupabaseClient,
  usage: 'live' | 'import',
  key?: string,
): Promise<SourceRow | null> {
  let query = service
    .from('catalog_sources')
    .select('id, key, kind, mode, enabled, capabilities, config, cache_ttl_minutes, sync_cursor')
    .eq('enabled', true)
    .neq('kind', 'file')
    .in('mode', [usage, 'both'])
    .order('priority', { ascending: false })
    .limit(1)
  if (key) query = query.eq('key', key)
  const { data, error } = await query
  if (error) throw error
  return (data?.[0] as SourceRow | undefined) ?? null
}
