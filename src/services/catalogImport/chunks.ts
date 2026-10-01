// Sends import rows in chunks, adapting to the database limits. Shared by the admin page
// and the command-line importer (scripts/import-catalog.mjs). No Supabase dependency here.
import type { ImportChunkResult } from '../../types'
import type { ImportRow } from './mapping'

export interface ImportProgress {
  sent: number
  total: number
  inserted: number
  updated: number
  skipped: number
  failed: number
  errors: { row: number; error: string }[]
  warnings: { row: number; warnings: string[] }[]
  /** Current chunk size (shrinks after timeouts, grows back after successes). */
  chunkSize: number
  retries: number
}

export interface ChunkOptions {
  initialSize?: number
  minSize?: number
  maxRetries?: number
  onProgress?: (progress: ImportProgress) => void
  isCancelled?: () => boolean
  /** Wait between retries (ms × attempt); tests pass 0. */
  backoffMs?: number
}

/**
 * Errors worth retrying: statement timeout (57014, Supabase's per-request limit), gateway /
 * server errors and network failures. A timed-out call is rolled back by Postgres, so
 * retrying never duplicates rows (and the importer upserts anyway).
 */
export function isRetriable(error: unknown): boolean {
  const e = (error ?? {}) as { code?: string; status?: number; message?: string; name?: string }
  if (e.code === '57014') return true
  if (typeof e.status === 'number' && e.status >= 500) return true
  return /timeout|timed out|fetch failed|network|ECONNRESET|ETIMEDOUT|socket hang up|502|503|504/i.test(
    `${e.name ?? ''} ${e.message ?? ''}`,
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Sends `rows` through `send(chunk, offset)` and accumulates the results. On a retriable
 * error the chunk is halved (down to `minSize`) and retried; at the minimum size it is
 * retried up to `maxRetries` times before the error is thrown.
 */
export async function sendInChunks(
  rows: ImportRow[],
  send: (chunk: ImportRow[], offset: number) => Promise<ImportChunkResult>,
  options: ChunkOptions = {},
): Promise<{ progress: ImportProgress; cancelled: boolean }> {
  const initial = options.initialSize ?? 200
  const min = options.minSize ?? 10
  const maxRetries = options.maxRetries ?? 4
  const backoff = options.backoffMs ?? 1500
  const progress: ImportProgress = {
    sent: 0,
    total: rows.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    warnings: [],
    chunkSize: initial,
    retries: 0,
  }
  let size = initial
  let attempts = 0
  let streak = 0
  let offset = 0
  while (offset < rows.length) {
    if (options.isCancelled?.()) return { progress, cancelled: true }
    const chunk = rows.slice(offset, offset + size)
    try {
      const result = await send(chunk, offset)
      offset += chunk.length
      progress.sent = offset
      progress.inserted += result.inserted
      progress.updated += result.updated
      progress.skipped += result.skipped
      progress.failed += result.failed
      // Keep memory bounded on very large imports: the first errors are what matters.
      if (progress.errors.length < 5000) progress.errors.push(...result.errors)
      if (progress.warnings.length < 5000) progress.warnings.push(...result.warnings)
      attempts = 0
      if (++streak >= 5 && size < initial) {
        size = Math.min(initial, size * 2)
        streak = 0
      }
    } catch (error) {
      if (!isRetriable(error)) throw error
      streak = 0
      progress.retries++
      if (size > min) size = Math.max(min, Math.floor(size / 2))
      else if (++attempts > maxRetries) throw error
      if (backoff) await sleep(backoff * Math.max(attempts, 1))
    }
    progress.chunkSize = size
    options.onProgress?.({ ...progress })
  }
  return { progress, cancelled: false }
}
