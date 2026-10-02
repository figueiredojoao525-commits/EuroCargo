// Bulk import of product photos named by reference → Supabase Storage (bucket "product-images").
//
//   npm run images:import -- <pasta> --dry-run                     analisa: corresponde, valida, otimiza, relatório
//   npm run images:import -- <pasta> --license "Foto EuroCargo"    carrega e associa (conta de administrador)
//
// Ficheiros: <referência>.jpg (SKU, referência do fabricante, EAN ou OE); mais fotos da mesma peça:
// <referência>__2.jpg, <referência>_2.jpg ou "<referência> (2).jpg". Nomes que não são referências:
// --map mapa.csv com as colunas "ficheiro;referencia".
//
// Options:
//   --dry-run              nothing is uploaded (no login needed)
//   --license <text>       licence / authorisation stored with every photo (required to upload)
//   --source <text>        credit shown under the photo (default "EuroCargo")
//   --map <file.csv>       file name → reference for files not named by reference
//   --allow-demo           also match DEMO products (off by default: real photos never go to DEMO data)
//   --limit <n>            process at most n files (useful for a first small test)
//
// Safe to re-run: files are content-addressed (SHA-256); the manifest (images-work/import/manifest.json)
// remembers what was uploaded, Storage uploads never overwrite, and an image row is only added once per URL.
// Uses only the public key + an ADMIN login (ADMIN_EMAIL / ADMIN_PASSWORD in .env.local): RLS applies.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import sharp from 'sharp'
import { BUCKET, WORK, adminClient, args, csv, fetchProducts, importTs, publicClient, readJson, sha256, writeJson } from './lib.mjs'

const a = args()
const VALUE_OPTIONS = ['--license', '--source', '--map', '--limit']
const [folder] = a.positional(VALUE_OPTIONS)
if (!folder) {
  console.log('Uso: npm run images:import -- <pasta> [--dry-run] [--license "texto"] [--source "EuroCargo"] [--map mapa.csv] [--limit 20]')
  process.exit(1)
}
const dryRun = a.flag('dry-run')
const license = a.option('license')
const source = a.option('source', 'EuroCargo')
const allowDemo = a.flag('allow-demo')
const limit = Number(a.option('limit', '0')) || Infinity
if (!dryRun && !license) {
  console.log('Indique --license "…" (ex.: "Fotografia própria EuroCargo" ou "Licenciado pelo fornecedor"). Só imagens próprias ou autorizadas.')
  process.exit(1)
}

const M = await importTs('src/services/images/matching.ts')
const OUT = join(WORK, 'import')
const MANIFEST = join(OUT, 'manifest.json')
const manifest = readJson(MANIFEST, { entries: {} })
mkdirSync(OUT, { recursive: true })
const mapping = a.option('map') ? M.parseMapping(readFileSync(a.option('map'), 'utf8')) : new Map()

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    return e.isDirectory() ? walk(path) : M.isImageFile(e.name) ? [path] : []
  })
}

// ── Catalogue (read-only) ──
const supabase = dryRun ? publicClient() : await adminClient()
const products = await fetchProducts(supabase)
const refs = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('product_references').select('product_id, reference_norm').order('id').range(from, from + 999)
  if (error) break // older databases without the index: SKU / part number / EAN / OE still match
  refs.push(...data)
  if (data.length < 1000) break
}
const byId = new Map(products.map((p) => [p.id, p]))
const index = M.buildIndex(products, refs)
console.log(`Catálogo: ${products.length} produtos, ${index.size} referências indexadas${dryRun ? ' (simulação)' : ''}`)

// ── Analyse + optimise ──
const files = walk(folder).slice(0, limit)
console.log(`Pasta: ${folder} — ${files.length} imagem(ns)\n`)
const rows = []
const seenForProduct = new Set()
for (const file of files) {
  const name = basename(file)
  const fromName = M.referenceFromFilename(name)
  const reference = mapping.get(name.toLowerCase()) ?? fromName.reference
  const row = { file: relative(folder, file), reference, position: fromName.position, status: '', product_id: '', sku: '', detail: '' }
  rows.push(row)

  const match = M.matchReference(reference, index, (id) => byId.get(id)?.is_demo === true, { allowDemo })
  if (match.status !== 'exact') {
    row.status = match.status === 'demo' ? 'demo (ignorado)' : match.status === 'ambiguous' ? 'ambíguo (pendente)' : 'sem correspondência'
    row.detail = match.productIds.map((id) => byId.get(id)?.sku).join(' ')
    continue
  }
  const product = byId.get(match.productIds[0])
  row.product_id = product.id
  row.sku = product.sku

  let input
  try {
    input = readFileSync(file)
    const meta = await sharp(input).metadata()
    if (!meta.width || !meta.height) throw new Error('sem dimensões')
    if (Math.min(meta.width, meta.height) < 300) {
      row.status = 'rejeitada'
      row.detail = `muito pequena (${meta.width}×${meta.height}, mínimo 300 px)`
      continue
    }
  } catch (error) {
    row.status = 'rejeitada'
    row.detail = `ficheiro de imagem inválido (${error.message})`
    continue
  }

  const hash = sha256(input)
  row.hash = hash
  const key = `${product.id}:${hash}`
  if (seenForProduct.has(key)) {
    row.status = 'duplicada'
    row.detail = 'a mesma imagem já está nesta importação para este produto'
    continue
  }
  seenForProduct.add(key)
  const paths = M.storagePaths(product.id, hash)
  const entry = manifest.entries[key] ?? { productId: product.id, hash, paths, file: row.file, uploaded: false }
  manifest.entries[key] = entry
  if (entry.uploaded) {
    row.status = 'já carregada'
    row.detail = entry.url
    continue
  }
  // Optimised copies (EXIF orientation applied, metadata removed, never enlarged).
  const large = await sharp(input).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
  const small = await sharp(input).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 74 }).toBuffer()
  writeFileSync(join(OUT, `${hash.slice(0, 32)}-1200.webp`), large, { flag: 'w' })
  writeFileSync(join(OUT, `${hash.slice(0, 32)}-480.webp`), small, { flag: 'w' })
  entry.bytes = large.length + small.length
  row.status = 'pronta (exata)'
  row.detail = `${Math.round(statSync(file).size / 1024)} KB → ${Math.round(entry.bytes / 1024)} KB`
}
writeJson(MANIFEST, manifest)

// ── Upload + associate ──
const ready = rows.filter((r) => r.status === 'pronta (exata)')
const totalBytes = ready.reduce((sum, r) => sum + (manifest.entries[`${r.product_id}:${r.hash}`]?.bytes ?? 0), 0)
console.log(`Prontas: ${ready.length} (${(totalBytes / 1024 / 1024).toFixed(1)} MB a carregar)`)
// Supabase Free: 1 GB of files in total (docs/images.md → custos). Never upload a huge batch blindly.
if (totalBytes > 500 * 1024 * 1024) {
  console.log('Aviso: mais de 500 MB num só lote. O plano gratuito do Supabase tem 1 GB no total — confirme o uso em Supabase → Usage.')
  if (!dryRun && !a.flag('yes')) {
    console.log('Nada foi carregado. Repita com --yes se quiser mesmo continuar.')
    process.exit(1)
  }
}
if (!dryRun && ready.length) {
  const { data: base } = supabase.storage.from(BUCKET).getPublicUrl('x')
  const publicBase = base.publicUrl.replace(/\/x$/, '')
  for (const row of ready) {
    const hash = row.hash
    const entry = manifest.entries[`${row.product_id}:${hash}`]
    try {
      for (const [size, path] of [['1200', entry.paths.large], ['480', entry.paths.small]]) {
        const body = readFileSync(join(OUT, `${hash.slice(0, 32)}-${size}.webp`))
        const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
        // Same content-addressed path already there (earlier interrupted run): keep it, never overwrite.
        if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`Storage: ${error.message}`)
      }
      const url = `${publicBase}/${entry.paths.large}`
      const { data: existing, error: readError } = await supabase.from('product_images').select('id, url').eq('product_id', row.product_id)
      if (readError) throw new Error(readError.message)
      if (!existing.some((img) => img.url === url)) {
        const { data: image, error } = await supabase
          .from('product_images')
          .insert({
            product_id: row.product_id,
            url,
            alt: null,
            position: existing.length + row.position - 1,
            source: source.slice(0, 200),
            license: license.slice(0, 200),
            data_source: 'image-import',
            is_primary: existing.length === 0 && row.position === 1,
          })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        await supabase.from('product_image_sources').insert({ image_id: image.id, storage_path: entry.paths.large })
      }
      entry.uploaded = true
      entry.url = url
      row.status = 'carregada (exata)'
      row.detail = url
    } catch (error) {
      row.status = 'erro'
      row.detail = error.message
    }
    writeJson(MANIFEST, manifest) // resumable after every file
  }
}

writeFileSync(join(OUT, 'report.csv'), csv(rows, ['file', 'reference', 'position', 'status', 'sku', 'product_id', 'detail']))
const count = (status) => rows.filter((r) => r.status.startsWith(status)).length
console.log(`
Resumo
  exatas prontas/carregadas: ${count('pronta') + count('carregada') + count('já carregada')}
  sem correspondência:       ${count('sem correspondência')}
  ambíguas (pendentes):      ${count('ambíguo')}
  DEMO ignoradas:            ${count('demo')}
  rejeitadas / duplicadas:   ${count('rejeitada')} / ${count('duplicada')}
  erros:                     ${count('erro')}
Relatório: ${join(OUT, 'report.csv')}${dryRun ? '\n(simulação: nada foi carregado)' : ''}`)
