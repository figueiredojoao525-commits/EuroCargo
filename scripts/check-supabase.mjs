// Read-only connectivity and security check against the Supabase project in `.env`.
//   npm run check:supabase
// Uses only the public publishable/anon key, exactly like the browser does. It never
// writes data, never signs up users and never calls payment functions successfully.
import { loadEnv } from 'vite'

const env = loadEnv(process.env.MODE ?? 'development', process.cwd(), 'VITE_')
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
// Publishable key; the legacy anon key is only used when it is not set (same rule as src/lib/supabase.ts).
const keyName = env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : 'VITE_SUPABASE_ANON_KEY'
const key = env[keyName]

let failures = 0
const ok = (msg) => console.log(`  ✔ ${msg}`)
const info = (msg) => console.log(`  ℹ ${msg}`)
const fail = (msg) => {
  failures++
  console.log(`  ✘ ${msg}`)
}

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role
  } catch {
    return undefined
  }
}

console.log('\nEuroCargo — Supabase check\n')
console.log('1. Environment')
if (!url || !key) {
  if (!url) fail('VITE_SUPABASE_URL is missing or empty in .env')
  if (!key) fail('VITE_SUPABASE_PUBLISHABLE_KEY is missing or empty in .env')
  console.log('\nFill in .env with the Project URL and the publishable key (Project Settings → API Keys).\n')
  process.exit(1)
}
if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
  fail(`${keyName} is a SECRET key. Remove it from .env and rotate it in the Supabase dashboard.`)
  process.exit(1)
}
const isJwt = key.startsWith('eyJ')
// Values are never printed, only their shape.
const standardUrl = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)
ok(`VITE_SUPABASE_URL set (${standardUrl ? 'https://<ref>.supabase.co' : 'custom format'})`)
ok(`${keyName} set (${isJwt ? `legacy JWT, role=${jwtRole(key)}` : key.startsWith('sb_publishable_') ? 'publishable' : 'unknown format'})`)
if (!standardUrl) info('URL is not the usual https://<ref>.supabase.co format (fine for custom domains)')

const headers = { apikey: key, 'Content-Type': 'application/json', ...(isJwt ? { Authorization: `Bearer ${key}` } : {}) }
async function call(path, init = {}) {
  try {
    const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } })
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: res.status, body }
  } catch (error) {
    return { status: 0, body: String(error.cause?.code ?? error.message) }
  }
}
const rpc = (name, args) => call(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })
const isPermissionDenied = (r) => [401, 403].includes(r.status) && (r.body?.code === '42501' || /permission denied/i.test(r.body?.message ?? ''))

console.log('\n2. Auth')
const settings = await call('/auth/v1/settings')
if (settings.status === 200) {
  ok('Auth reachable')
  if (settings.body.external?.email) ok('email/password sign-in enabled')
  else fail('email provider is disabled (Authentication → Providers → Email)')
  info(settings.body.mailer_autoconfirm ? 'email confirmation is OFF (accounts are active immediately)' : 'email confirmation is ON')
  if (settings.body.disable_signup) fail('sign-ups are disabled in Auth settings')
} else if (settings.status === 0) {
  fail(`cannot reach VITE_SUPABASE_URL (${settings.body})`)
  process.exit(1)
} else {
  fail(`Auth returned HTTP ${settings.status}: ${JSON.stringify(settings.body)} — check the key`)
}

console.log('\n3. Database (migration)')
const tracking = await rpc('get_tracking', { p_code: 'EC-PT-2000-AAAAAA' })
if (tracking.status === 200 && tracking.body === null) ok('get_tracking() callable by anon and returns null for an unknown code')
else if (tracking.body?.code === 'PGRST202' || tracking.status === 404) fail('get_tracking() not found — the migration has not been applied')
else fail(`get_tracking() unexpected response: HTTP ${tracking.status} ${JSON.stringify(tracking.body)}`)

const catalogue = await rpc('search_products', { p_query: null, p_limit: 1 })
if (catalogue.status === 200 && typeof catalogue.body?.total === 'number')
  ok(`search_products() public: ${catalogue.body.total} active product(s) in the catalogue`)
else if (catalogue.body?.code === 'PGRST202') fail('search_products() not found — catalogue migration not applied')
else fail(`search_products() unexpected response: HTTP ${catalogue.status} ${JSON.stringify(catalogue.body)}`)

// Catalogue at scale (migration 20261002000000_catalog_scale_import) — optional until applied.
const scaleSearch = await rpc('catalog_search', { p_params: { limit: 1 } })
const scaleApplied = scaleSearch.status === 200 && typeof scaleSearch.body?.total === 'number'
if (scaleApplied)
  ok(`catalog_search() public: ${scaleSearch.body.total}${scaleSearch.body.total_capped ? '+' : ''} active product(s)`)
else if (scaleSearch.body?.code === 'PGRST202')
  info('catalog_search() not found — migration 20261002000000_catalog_scale_import not applied yet (the website falls back to search_products)')
else fail(`catalog_search() unexpected response: HTTP ${scaleSearch.status} ${JSON.stringify(scaleSearch.body)}`)
if (scaleApplied) {
  const config = await rpc('catalog_public_config', {})
  if (config.status === 200 && Array.isArray(config.body?.sources)) {
    const leaked = config.body.sources.some((s) => 'config' in s || 'notes' in s || 'supplier_id' in s)
    if (leaked) fail('catalog_public_config() exposes internal source fields')
    else ok(`catalog_public_config(): ${config.body.sources.length} enabled source(s), no internal fields`)
  } else fail(`catalog_public_config() unexpected response: HTTP ${config.status} ${JSON.stringify(config.body)}`)
}

console.log('\n4. Row Level Security / privileges (anon must be blocked)')
for (const table of [
  'profiles', 'shipments', 'shipment_events', 'payments', 'admin_actions',
  'suppliers', 'supplier_products', 'price_rules', 'product_price_history',
  'customers', 'customer_addresses', 'orders', 'order_items', 'order_events', 'order_notes',
  'ai_conversations', 'ai_messages', 'ai_search_logs',
  ...(scaleApplied ? ['catalog_sources', 'catalog_import_batches', 'product_image_sources', 'catalog_live_queries'] : []),
]) {
  const r = await call(`/rest/v1/${table}?select=*&limit=1`)
  if (isPermissionDenied(r)) ok(`anon cannot read ${table}`)
  else if (r.status === 200 && Array.isArray(r.body) && r.body.length === 0)
    fail(`anon has SELECT on ${table} (RLS hides rows, but the migration's REVOKE did not apply)`)
  else if (r.status === 200) fail(`anon can READ ${table} rows — data exposed!`)
  else if (r.body?.code === 'PGRST205' || r.status === 404) fail(`table ${table} not found — migration not applied`)
  else fail(`${table}: unexpected HTTP ${r.status} ${JSON.stringify(r.body)}`)
}
const dummy = '00000000-0000-0000-0000-000000000000'
for (const [name, args] of [
  ['confirm_tracking_payment', { p_payment_id: dummy, p_provider: 'check', p_provider_payment_id: 'check', p_amount: 1, p_currency: 'EUR' }],
  ['mark_payment_failed', { p_payment_id: dummy, p_provider: 'check', p_provider_payment_id: 'check' }],
  ['request_tracking_code', { p_shipment_id: dummy }],
  ['admin_add_shipment_event', { p_shipment_id: dummy, p_status: 'delivered' }],
  ['admin_dashboard_stats', {}],
  ['create_part_request', { p_items: [], p_message: 'check' }],
  ['admin_create_shipment', { p_shipment: {} }],
  ['admin_generate_tracking_code', { p_shipment_id: dummy }],
  ['admin_recalculate_price', { p_product_id: dummy, p_apply: false }],
  ['admin_recalculate_all_prices', {}],
  ['admin_purge_demo_data', {}],
  ...(scaleApplied
    ? [
        ['admin_catalog_import_start', { p_source_id: dummy, p_format: 'csv' }],
        ['admin_catalog_import_rows', { p_batch_id: dummy, p_rows: [] }],
        ['admin_catalog_import_finish', { p_batch_id: dummy }],
        ['catalog_import_start', { p_source_id: dummy, p_format: 'api' }],
        ['catalog_import_rows', { p_batch_id: dummy, p_rows: [] }],
        ['catalog_compute_price', { p_product_id: dummy, p_apply: false }],
      ]
    : []),
]) {
  const r = await rpc(name, args)
  if (isPermissionDenied(r) || r.body?.code === 'PGRST202') ok(`anon cannot execute ${name}()`)
  else fail(`anon reached ${name}(): HTTP ${r.status} ${JSON.stringify(r.body)}`)
}

// The public catalogue exposes active rows only.
const inactive = await call('/rest/v1/products?select=id&active=eq.false&limit=1')
if (inactive.status === 200 && Array.isArray(inactive.body) && inactive.body.length === 0) ok('anon sees no inactive products')
else if (inactive.status === 200) fail('anon can read INACTIVE products')
else fail(`products: unexpected HTTP ${inactive.status} ${JSON.stringify(inactive.body)}`)

console.log('\n5. Edge Functions (informational)')
for (const fn of ['create-checkout', 'payment-webhook', 'ai-assistant', 'catalog-external', 'catalog-sync']) {
  const r = await call(`/functions/v1/${fn}`, { method: 'OPTIONS' })
  info(`${fn}: ${r.status === 404 ? 'not deployed' : r.status === 0 ? 'unreachable' : `deployed (HTTP ${r.status})`}`)
}

console.log(failures ? `\n✘ ${failures} problem(s) found\n` : '\n✔ Frontend → Supabase → Auth/Database OK\n')
process.exit(failures ? 1 : 0)
