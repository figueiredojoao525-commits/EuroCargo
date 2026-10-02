// Shared helpers for the image tools (scripts/images/*.mjs). No secrets here: the public key comes
// from .env and admin actions log in with ADMIN_EMAIL / ADMIN_PASSWORD (.env.local, git-ignored).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { build } from 'rolldown'
import { loadEnv } from 'vite'

export const ROOT = process.cwd()
/** Working folder for downloads, manifests and reports (git-ignored). */
export const WORK = join(ROOT, 'images-work')
export const BUCKET = 'product-images'

export const env = { ...loadEnv('production', ROOT, ''), ...process.env }

export function args() {
  const list = process.argv.slice(2)
  return {
    list,
    flag: (name) => list.includes(`--${name}`),
    option: (name, fallback) => {
      const i = list.indexOf(`--${name}`)
      return i >= 0 && list[i + 1] && !list[i + 1].startsWith('--') ? list[i + 1] : fallback
    },
    positional: (valueOptions = []) =>
      list.filter((a, i) => !a.startsWith('--') && !valueOptions.includes(list[i - 1])),
  }
}

export function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Bundles a TypeScript module of src/ on the fly (same approach as import-catalog.mjs). */
export async function importTs(relativePath) {
  const outDir = join(ROOT, 'node_modules', '.tmp')
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, `${relativePath.replace(/[\\/]/g, '__').replace(/\.ts$/, '')}.mjs`)
  await build({ input: join(ROOT, relativePath), platform: 'node', logLevel: 'warn', output: { file: out, format: 'esm' } })
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`)
}

export function publicClient() {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env')
  if (/service_role|sb_secret_/.test(key)) throw new Error('Use a chave pública (publishable), nunca a secreta.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } })
}

/** Logs in as an administrator (RLS and is_admin() still apply: no secret key is ever used). */
export async function adminClient() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (conta de administrador) no ambiente ou em .env.local.')
  }
  const supabase = publicClient()
  const { error } = await supabase.auth.signInWithPassword({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD })
  if (error) throw new Error(`Login falhou: ${error.message}`)
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (isAdmin !== true) throw new Error('A conta não é administradora.')
  return supabase
}

/** Every product the public can see (paged; read-only). */
export async function fetchProducts(supabase) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, part_number, ean, oe_numbers, name, is_demo, category:part_categories(slug), brand:brands(name)')
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(`Leitura de produtos falhou: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

/** product_id → number of images (public columns only). */
export async function fetchImageCounts(supabase) {
  const counts = new Map()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('product_images').select('product_id, url').order('id').range(from, from + 999)
    if (error) throw new Error(`Leitura de imagens falhou: ${error.message}`)
    for (const row of data) counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1)
    if (data.length < 1000) break
  }
  return counts
}

export function csv(rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return `${[columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n')}\n`
}
