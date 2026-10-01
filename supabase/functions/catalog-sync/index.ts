// POST { source: "<catalog_sources.key>", max_pages?: number } — incremental synchronisation
// of a REST / licensed source into EuroCargo's catalogue (prices from the pricing rules,
// costs stored internally in supplier_products).
//
// Who can call it:
//   * an admin from the website (Admin → Catálogo → Providers → "Sincronizar agora"), or
//   * a scheduler with the service_role key (e.g. Supabase Cron / pg_net every night).
// It resumes from catalog_sources.sync_cursor and stores the new cursor at the end, so large
// catalogues are synchronised in pages over several runs (never loaded whole in memory).
//
// Credentials only in Supabase secrets (CATALOG_PROVIDER / CATALOG_API_URL / CATALOG_API_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { findSource, importRows } from '../_shared/catalog/provider.ts'
import { getCatalogAdapter } from '../_shared/catalog/registry.ts'
import { corsHeaders, json, requireEnv } from '../_shared/http.ts'

// Edge Functions have a wall-clock limit: stop starting new pages after this.
const TIME_BUDGET_MS = 100_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization') ?? ''
  const isService = authorization === `Bearer ${serviceKey}`
  if (!isService) {
    const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const { data: isAdmin } = await caller.rpc('is_admin')
    if (isAdmin !== true) return json({ error: 'forbidden' }, 403)
  }

  let body: { source?: unknown; max_pages?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  const sourceKey = typeof body.source === 'string' ? body.source.slice(0, 40) : ''
  const maxPages = Math.min(Math.max(Number(body.max_pages) || 5, 1), 50)
  if (!sourceKey) return json({ error: 'missing_source' }, 400)

  const service = createClient(requireEnv('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } })
  const started = Date.now()
  try {
    const source = await findSource(service, 'import', sourceKey)
    if (!source) return json({ error: 'catalog_source_not_found_or_disabled' }, 404)
    if (!source.capabilities.includes('sync')) return json({ error: 'source_without_sync' }, 400)
    const adapter = getCatalogAdapter(source.config)
    if (!adapter?.fetchChanges) return json({ error: 'catalog_not_configured' }, 503)

    let cursor = source.sync_cursor
    const totals = { pages: 0, rows: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, done: false }
    while (totals.pages < maxPages && Date.now() - started < TIME_BUDGET_MS) {
      const page = await adapter.fetchChanges(cursor)
      const summary = await importRows(service, source.id, page.rows, {
        fileName: `sync:${source.key}`,
        // Where to resume. At the end of a pass the last cursor is kept, so the next run
        // asks the provider for changes after it (incremental sync).
        syncCursor: page.nextCursor ?? cursor ?? null,
      })
      totals.pages++
      totals.rows += page.rows.length
      totals.inserted += summary.inserted
      totals.updated += summary.updated
      totals.skipped += summary.skipped
      totals.failed += summary.failed
      cursor = page.nextCursor
      if (!page.nextCursor) {
        totals.done = true
        break
      }
    }
    return json(totals)
  } catch (error) {
    console.error('catalog-sync failed', error)
    return json({ error: 'catalog_sync_failed' }, 502)
  }
})
