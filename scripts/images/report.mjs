// Which products have a photo, an illustrative photo or nothing (read-only, public key).
//
//   npm run images:report                → images-work/report/products.csv + summary
//   npm run images:report -- --missing   → only products without their own photo
//
// Classes: "foto própria" (product_images, i.e. exact photo from a feed or from images:import),
// "ilustrativa (tipo)" / "ilustrativa (categoria)" (site photo of the part type, labelled on the site),
// "sem fotografia" (only the drawn category illustration).
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { WORK, args, csv, fetchImageCounts, fetchProducts, importTs, publicClient } from './lib.mjs'

const a = args()
const { illustrativeKey } = await importTs('src/utils/productImage.ts')
const { partTypeOf } = await importTs('src/utils/partTypes.ts')
const supabase = publicClient()
const [products, images] = await Promise.all([fetchProducts(supabase), fetchImageCounts(supabase)])

const rows = products.map((p) => {
  const own = images.get(p.id) ?? 0
  const key = illustrativeKey(p.category?.slug, p.name)
  const type = partTypeOf(p.category?.slug, p.name)
  const status = own > 0 ? 'foto própria' : key ? (type?.key === key ? 'ilustrativa (tipo)' : 'ilustrativa (categoria)') : 'sem fotografia'
  return {
    id: p.id,
    sku: p.sku,
    part_number: p.part_number,
    name: p.name,
    category: p.category?.slug ?? '',
    demo: p.is_demo ? 'sim' : 'não',
    own_photos: own,
    status,
    illustrative: own > 0 ? '' : (key ?? ''),
  }
})

const list = a.flag('missing') ? rows.filter((r) => r.own_photos === 0) : rows
const dir = join(WORK, 'report')
mkdirSync(dir, { recursive: true })
const file = join(dir, a.flag('missing') ? 'products-missing.csv' : 'products.csv')
writeFileSync(file, csv(list, ['sku', 'part_number', 'name', 'category', 'demo', 'own_photos', 'status', 'illustrative', 'id']))

const count = (s) => rows.filter((r) => r.status === s).length
console.log(`Produtos: ${rows.length} (${rows.filter((r) => r.demo === 'sim').length} DEMO, ${rows.filter((r) => r.demo === 'não').length} reais)
  foto própria (exata):        ${count('foto própria')}
  ilustrativa (tipo de peça):  ${count('ilustrativa (tipo)')}
  ilustrativa (categoria):     ${count('ilustrativa (categoria)')}
  sem fotografia:              ${count('sem fotografia')}
Relatório: ${file}`)
