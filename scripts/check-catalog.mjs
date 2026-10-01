// Read-only functional check of the catalogue on the Supabase project in `.env`, as an
// anonymous visitor (publishable key only). Never writes data.
//   npm run check:catalog
// Checks: search (text, synonyms, reference, OE, vehicle, engine), DEMO data, the seller rule
// (customers never see suppliers, costs, margins or internal source data) and visitor permissions.
import { loadEnv } from 'vite'

const env = loadEnv(process.env.MODE ?? 'development', process.cwd(), 'VITE_')
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.log('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing in .env')
  process.exit(1)
}
const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) }

let failures = 0
const ok = (msg) => console.log(`  ✔ ${msg}`)
const info = (msg) => console.log(`  ℹ ${msg}`)
const fail = (msg) => {
  failures++
  console.log(`  ✘ ${msg}`)
}
const check = (cond, msg, detail = '') => (cond ? ok(msg) : fail(detail ? `${msg} — ${detail}` : msg))

async function call(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body, headers: res.headers }
}
const rpc = (name, args) => call(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })
const search = async (params) => (await rpc('catalog_search', { p_params: params })).body
const denied = (r) => [401, 403].includes(r.status) || r.body?.code === '42501' || r.body?.code === 'PGRST202'
const parts = (r) => (r?.items ?? []).map((i) => i.part_number)
const ids = async (table, filter) => (await call(`/rest/v1/${table}?select=id&${filter}`)).body?.[0]?.id
const count = async (path) => {
  const r = await call(path, { headers: { Prefer: 'count=exact', Range: '0-0' } })
  return Number(r.headers.get('content-range')?.split('/')[1])
}

console.log('\nEuroCargo — catalogue check (visitor, read-only)\n')

console.log('1. Migrations')
const probe = await rpc('catalog_search', { p_params: { limit: 1 } })
if (probe.body?.code === 'PGRST202') {
  console.log('  ✘ catalog_search() not found — migration 20261002000000_catalog_scale_import is not applied.\n')
  process.exit(1)
}
check(probe.status === 200 && typeof probe.body?.total === 'number', 'catalog_search() available to visitors', JSON.stringify(probe.body))
const internalProbe = await call('/rest/v1/products?select=data_source&limit=1')
const sellerModel = [401, 403].includes(internalProbe.status)
check(sellerModel, 'seller model (20261004000000): internal product columns are not readable by visitors',
  `products.data_source is readable (HTTP ${internalProbe.status}) — apply 20261004000000_eurocargo_seller_model`)

console.log('\n2. Products and DEMO data')
const total = await count('/rest/v1/products?select=id')
ok(`${total} active product(s) visible to visitors`)
const demoTotal = await count('/rest/v1/products?select=id&is_demo=eq.true')
const realTotal = await count('/rest/v1/products?select=id&is_demo=eq.false')
info(`${demoTotal} DEMO · ${realTotal} real`)
const DEMO = {
  'DEMO-307-HL-L-N': 120, 'DEMO-307-HL-L-U': 65, 'DEMO-307-HL-R-N': 120, 'DEMO-GOLF5-BP-F': 34.9,
  'DEMO-GOLF5-BD-F': 49.9, 'DEMO-CLIO3-OF': 8.5, 'DEMO-IBIZA6J-SA-R': 29, 'DEMO-E90-ALT': null,
}
const demo = await call(`/rest/v1/products?select=sku,price,is_demo&sku=like.DEMO-*&order=sku`)
const demoRows = Array.isArray(demo.body) ? demo.body : []
// DEMO data is temporary: once purged (Admin → Preços), the DEMO-based checks are skipped.
const hasDemo = demoRows.length > 0
if (!hasDemo) info('no DEMO products (purged) — DEMO-based checks skipped')
else check(demoRows.length === 8, 'original 8 DEMO products present', `found ${demoRows.length}`)
for (const [sku, price] of hasDemo ? Object.entries(DEMO) : []) {
  const row = demoRows.find((r) => r.sku === sku)
  check(row?.is_demo && (row.price === null ? null : Number(row.price)) === price, `DEMO ${sku} intact (price ${price ?? 'on request'})`, JSON.stringify(row))
}
const expanded = await count('/rest/v1/products?select=id&sku=like.DM-*')
if (expanded > 0) {
  check(expanded >= 700, `expanded DEMO catalogue: ${expanded} products (20261004000100)`)
  const cats = await call('/rest/v1/part_categories?select=slug&active=eq.true')
  check((cats.body?.length ?? 0) >= 15, `${cats.body?.length} categories`)
  const notFlagged = await count('/rest/v1/products?select=id&sku=like.DM-*&is_demo=eq.false')
  check(notFlagged === 0, 'every expanded DEMO product is flagged is_demo', `${notFlagged} not flagged`)
} else info('expanded DEMO catalogue not loaded (20261004000100 not applied)')

console.log('\n3. Search')
let r = await search({ oe: 'OE-NAO-EXISTE-123' })
check(r.total === 0, 'OE: unknown OE number → no results (nothing invented)', JSON.stringify(r))
r = await rpc('search_products', { p_query: 'pastilhas', p_limit: 5 })
check(r.status === 200 && typeof r.body.total === 'number', 'previous search_products() still works', JSON.stringify(r.body).slice(0, 200))
if (hasDemo) {
  const vw = await ids('vehicle_makes', 'slug=eq.volkswagen')
  const golf = await ids('vehicle_models', 'slug=eq.golf-v')
  const peugeot = await ids('vehicle_makes', 'slug=eq.peugeot')
  const p307 = await ids('vehicle_models', 'slug=eq.307-sw')
  r = await search({ query: 'pastilhas', make_id: vw, model_id: golf, year: 2005, limit: 60 })
  check(parts(r).includes('DEMO-GOLF5-BP-F'), 'text + vehicle: "pastilhas" VW Golf V 2005 (plural/stem)', JSON.stringify(parts(r)))
  r = await search({ query: 'pastilhas', make_id: vw, model_id: golf, year: 2015 })
  check(r.total === 0, 'vehicle: outside the production years → none', JSON.stringify(parts(r)))
  r = await search({ query: 'farol esquerdo', make_id: peugeot, model_id: p307, limit: 60 })
  check(parts(r).includes('DEMO-307-HL-L-N'), 'synonyms: "farol esquerdo" → "Ótica dianteira esquerda"', JSON.stringify(parts(r)))
  r = await search({ query: 'faro izquierdo', make_id: peugeot, model_id: p307, limit: 60 })
  check(parts(r).includes('DEMO-307-HL-L-N'), 'synonyms (ES): "faro izquierdo"', JSON.stringify(parts(r)))
  r = await search({ reference: 'demo 307 hl l n' })
  check(r.items?.[0]?.part_number === 'DEMO-307-HL-L-N' && r.items[0].ref_match, 'reference (normalised spaces/dashes)', JSON.stringify(parts(r)))
  r = await search({ make_id: peugeot, limit: 2 })
  check(r.items?.length === 2 && r.total >= 3, 'vehicle only (Peugeot) + pagination', `total=${r.total} items=${r.items?.length}`)
  r = await search({ reference: 'DEMO-E90-ALT' })
  check(r.items?.[0]?.price === null, 'price on request stays empty (DEMO alternator)', JSON.stringify(r.items?.[0]?.price))
}
if (expanded > 0) {
  const peugeot = await ids('vehicle_makes', 'slug=eq.peugeot')
  const p307 = await ids('vehicle_models', 'slug=eq.307-sw')
  r = await search({ query: 'pastilhas', make_id: peugeot, model_id: p307, year: 2005, fuel: 'diesel', engine_cc: 1600, engine: 'hdi' })
  check(r.items?.length >= 1, '"pastilhas Peugeot 307 1.6 HDI 2005"', `total=${r.total}`)
  const opel = await ids('vehicle_makes', 'slug=eq.opel')
  const vectra = await ids('vehicle_models', 'slug=eq.vectra-c')
  r = await search({ query: 'farol esquerdo', make_id: opel, model_id: vectra, year: 2008 })
  check(r.items?.length >= 1, '"farol esquerdo Opel Vectra 2008"', `total=${r.total}`)
  r = await search({ query: 'oleo 5w30' })
  check(/5W-30/.test(r.items?.[0]?.name ?? ''), 'compact name search: "oleo 5w30"', r.items?.[0]?.name)
}

console.log('\n4. Seller rule — customers only see EuroCargo')
r = await search({ query: 'travao', limit: 60 })
const sample = JSON.stringify(r)
check(!/data_source|supplier|cost_price|margin|Fornecedor/i.test(sample), 'search results carry no supplier / cost / margin / source data')
const config = await rpc('catalog_public_config', {})
const sources = config.body?.sources ?? []
check(config.status === 200, 'catalog_public_config() available')
check(sources.every((s) => !('key' in s) && !('config' in s) && !('notes' in s)) || !sellerModel,
  'provider config exposes no source keys / config / notes', JSON.stringify(sources))
check(sources.every((s) => s.kind === 'file'), 'no external provider active', JSON.stringify(sources))
for (const [table, column] of [
  ['products', 'data_source'], ['products', 'external_id'], ['products', 'price_mode'],
  ['products', 'selected_supplier_id'], ['product_images', 'data_source'],
  ['product_vehicle_compatibility', 'source'], ['product_references', 'source'], ['vehicle_makes', 'data_source'],
]) {
  if (!sellerModel) break
  const t = await call(`/rest/v1/${table}?select=${column}&limit=1`)
  check([401, 403].includes(t.status), `visitor cannot read ${table}.${column}`, `HTTP ${t.status}`)
}
if (sellerModel) {
  const view = await call('/rest/v1/admin_products?select=id&limit=1')
  check([401, 403].includes(view.status), 'visitor cannot read admin_products', `HTTP ${view.status}`)
}

console.log('\n5. Visitor permissions (must be blocked)')
for (const table of ['catalog_sources', 'catalog_import_batches', 'product_image_sources', 'catalog_live_queries',
  'supplier_products', 'suppliers', 'price_rules', 'product_price_history', ...(sellerModel ? ['catalog_settings'] : [])]) {
  const t = await call(`/rest/v1/${table}?select=*&limit=1`)
  check([401, 403].includes(t.status), `visitor cannot read ${table}`, `HTTP ${t.status}`)
}
const dummy = '00000000-0000-0000-0000-000000000000'
for (const [name, args] of [
  ['admin_catalog_import_start', { p_source_id: dummy, p_format: 'csv' }],
  ['admin_catalog_import_rows', { p_batch_id: dummy, p_rows: [] }],
  ['admin_catalog_import_finish', { p_batch_id: dummy }],
  ['catalog_import_start', { p_source_id: dummy, p_format: 'api' }],
  ['catalog_import_rows', { p_batch_id: dummy, p_rows: [] }],
  ['catalog_import_finish', { p_batch_id: dummy }],
  ['catalog_compute_price', { p_product_id: dummy, p_apply: false }],
  ['admin_recalculate_price', { p_product_id: dummy, p_apply: false }],
  ['admin_purge_demo_data', {}],
  ['slugify', { p_value: 'x' }],
  ...(sellerModel
    ? [
        ['admin_product_offers', { p_product_id: dummy }],
        ['admin_refresh_all_offers', {}],
        ['catalog_refresh_offers', { p_product_id: dummy }],
        ['catalog_best_offer', { p_product_id: dummy }],
      ]
    : []),
]) {
  const t = await rpc(name, args)
  check(denied(t), `visitor cannot execute ${name}()`, `HTTP ${t.status} ${JSON.stringify(t.body)}`)
}
const write = await call('/rest/v1/search_synonyms', { method: 'POST', body: JSON.stringify({ term: 'teste', synonyms: ['x'] }) })
check([401, 403].includes(write.status), 'visitor cannot write search_synonyms', `HTTP ${write.status}`)

console.log(failures ? `\n✘ ${failures} problem(s)\n` : '\n✔ Catalogue OK\n')
process.exit(failures ? 1 : 0)
