// Admin: catalogue sources (providers) and bulk import. Every write is authorised in the
// database (RLS "admin all" + is_admin() in the admin_catalog_import_* functions).
import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'
import type { CatalogSource, ImportBatch, ImportChunkResult, ImportFormat, ImportMode } from '../../types'
import { clearCatalogCache } from '../catalog'
import { sendInChunks, type ImportProgress } from './chunks'
import type { ImportRow } from './mapping'

export * from './core'

/** Starting rows per database call (each call is one transaction; shrinks automatically on timeouts). */
export const IMPORT_CHUNK_SIZE = 200
/** Above this, use the catalog-sync Edge Function or split the file (browser memory / time). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

/** PostgREST: table / function missing → the 20261002 migration has not been applied yet. */
export function isMigrationMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883'
}

// ── Sources (providers) ──
export async function listCatalogSources(): Promise<CatalogSource[]> {
  const { data, error } = await getSupabase()
    .from('catalog_sources')
    .select('*')
    .order('priority', { ascending: false })
    .order('name')
  if (error) throw error
  return data as CatalogSource[]
}

export async function saveCatalogSource(row: Record<string, unknown>, id?: string): Promise<CatalogSource> {
  const supabase = getSupabase()
  const { data, error } = id
    ? await supabase.from('catalog_sources').update(row).eq('id', id).select().single()
    : await supabase.from('catalog_sources').insert(row).select().single()
  if (error) throw error
  clearCatalogCache()
  return data as CatalogSource
}

export async function deleteCatalogSource(id: string): Promise<void> {
  const { error } = await getSupabase().from('catalog_sources').delete().eq('id', id)
  if (error) throw error
  clearCatalogCache()
}

export interface ExternalStatus {
  /** catalog-external answered. */
  deployed: boolean
  /** An adapter is configured (secrets set + adapter implemented). */
  configured: boolean
  provider: string | null
  capabilities: string[]
}

/** Asks the catalog-external Edge Function what is configured (never returns secrets). */
export async function getExternalCatalogStatus(): Promise<ExternalStatus> {
  const { data, error } = await getSupabase().functions.invoke<ExternalStatus>('catalog-external', {
    body: { action: 'status' },
  })
  if (error) {
    const status = error instanceof FunctionsHttpError ? error.context.status : 0
    if (status === 503) return { deployed: true, configured: false, provider: null, capabilities: [] }
    return { deployed: false, configured: false, provider: null, capabilities: [] }
  }
  return { ...(data as ExternalStatus), deployed: true }
}

/** Runs one synchronisation of a REST source through the catalog-sync Edge Function. */
export async function runSourceSync(sourceKey: string): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().functions.invoke<Record<string, unknown>>('catalog-sync', {
    body: { source: sourceKey },
  })
  if (error) throw error
  clearCatalogCache()
  return data ?? {}
}

// ── Import batches ──
export async function listImportBatches(limit = 20): Promise<ImportBatch[]> {
  const { data, error } = await getSupabase()
    .from('catalog_import_batches')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as ImportBatch[]
}

export interface RunImportOptions {
  sourceId: string
  format: ImportFormat
  fileName: string
  mode: ImportMode
  createReferenceData: boolean
  onProgress?: (progress: ImportProgress) => void
  /** Checked between chunks; true stops the import (rows already sent stay imported). */
  isCancelled?: () => boolean
}

/** Sends the rows in chunks and closes the batch. Returns the final batch record. */
export async function runImport(rows: ImportRow[], options: RunImportOptions): Promise<ImportBatch> {
  const supabase = getSupabase()
  const { data: batchId, error: startError } = await supabase.rpc('admin_catalog_import_start', {
    p_source_id: options.sourceId,
    p_format: options.format,
    p_file_name: options.fileName.slice(0, 200),
    p_mode: options.mode,
    p_options: { create_reference_data: options.createReferenceData },
  })
  if (startError) throw startError

  let result: Awaited<ReturnType<typeof sendInChunks>>
  try {
    result = await sendInChunks(
      rows,
      async (chunk, offset) => {
        const { data, error, status } = await supabase.rpc('admin_catalog_import_rows', {
          p_batch_id: batchId,
          p_rows: chunk,
          p_row_offset: offset,
        })
        // The HTTP status lets gateway timeouts (504) be retried with a smaller chunk.
        if (error) throw Object.assign(error, { status })
        return data as ImportChunkResult
      },
      { initialSize: IMPORT_CHUNK_SIZE, onProgress: options.onProgress, isCancelled: options.isCancelled },
    )
  } catch (error) {
    // Close the batch so it is not left "running"; the error is still reported.
    await supabase.rpc('admin_catalog_import_finish', { p_batch_id: batchId, p_cancelled: true })
    throw error
  }
  const cancelled = result.cancelled

  const { data: batch, error: finishError } = await supabase.rpc('admin_catalog_import_finish', {
    p_batch_id: batchId,
    p_cancelled: cancelled,
  })
  if (finishError) throw finishError
  clearCatalogCache()
  return batch as ImportBatch
}
