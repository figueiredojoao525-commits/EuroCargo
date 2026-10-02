// Looks for freely licensed photos of the EXACT part on Wikimedia Commons, by reference (read-only).
//
//   npm run images:find [-- --limit 200]   → images-work/find/candidates.csv
//
// For each real (non-DEMO) product without a photo, searches Commons for its part number, OE numbers and
// EAN. A candidate is kept only when the file title or description contains the full reference; it is
// then "provável" and stays PENDING: nothing is downloaded or associated automatically. After checking a
// candidate by eye, download it into a folder named by the reference and run images:import.
// Commons rarely has photos of specific part numbers: supplier feeds (image URLs in the catalogue import)
// and EuroCargo's own photos are the main sources of exact photos.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IMAGE_PROPS, allowedLicense, api, describe } from './commons.mjs'
import { WORK, args, csv, fetchImageCounts, fetchProducts, importTs, publicClient } from './lib.mjs'

const a = args()
const limit = Number(a.option('limit', '200'))
const { normalizeRef } = await importTs('src/services/images/matching.ts')
const supabase = publicClient()
const [products, images] = await Promise.all([fetchProducts(supabase), fetchImageCounts(supabase)])
const targets = products.filter((p) => !p.is_demo && !images.get(p.id)).slice(0, limit)
console.log(`Produtos reais sem foto: ${products.filter((p) => !p.is_demo && !images.get(p.id)).length} (a analisar: ${targets.length})`)
if (products.every((p) => p.is_demo)) console.log('O catálogo só tem produtos DEMO: as referências DEMO são fictícias, não há fotografias exatas a procurar.')

const rows = []
for (const p of targets) {
  const refs = [...new Set([p.part_number, p.ean, ...(p.oe_numbers ?? [])].filter((r) => normalizeRef(r).length >= 5))]
  for (const ref of refs) {
    const data = await api({ action: 'query', generator: 'search', gsrsearch: `"${ref}" filetype:bitmap`, gsrnamespace: '6', gsrlimit: '10', iiurlwidth: '320', ...IMAGE_PROPS })
    for (const c of (data.query?.pages ?? []).map(describe)) {
      const text = normalizeRef(`${c.title} ${c.description}`)
      const brand = normalizeRef(p.brand?.name)
      if (!text.includes(normalizeRef(ref))) continue // reference not really in the file: discard
      rows.push({
        sku: p.sku,
        product_id: p.id,
        reference: ref,
        match: brand && text.includes(brand) ? 'provável (referência + marca)' : 'provável (referência)',
        status: allowedLicense(c.license) && !c.restrictions ? 'pendente de validação' : 'licença não permitida',
        image: c.thumb,
        source: c.pageUrl,
        license: c.license,
        author: c.author,
      })
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}
const dir = join(WORK, 'find')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'candidates.csv'), csv(rows, ['sku', 'reference', 'match', 'status', 'license', 'author', 'source', 'image', 'product_id']))
console.log(`Candidatas: ${rows.length} (nenhuma é associada automaticamente) → ${join(dir, 'candidates.csv')}`)
