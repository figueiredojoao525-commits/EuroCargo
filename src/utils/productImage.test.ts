import assert from 'node:assert/strict'
import { test } from 'node:test'
import { partTypeOf } from './partTypes'
import { categoryImage, illustrativeById, illustrativeImage, illustrativeImages, illustrativeKey, responsive } from './productImage'

test('product names map to the right part type', () => {
  const cases: [string, string, string][] = [
    ['travagem', 'Pastilhas de travão dianteiras', 'brake-pads'],
    ['travagem', 'Disco de travão traseiro', 'brake-disc'],
    ['travagem', 'Pinça de travão dianteira esquerda', 'brake-caliper'],
    ['filtros', 'Filtro de óleo', 'oil-filter'],
    ['filtros', 'Filtro de habitáculo', 'cabin-filter'],
    ['filtros', 'Filtro de combustível', 'fuel-filter'],
    ['filtros', 'Filtro de ar', 'air-filter'],
    ['iluminacao', 'Ótica dianteira esquerda', 'headlight'],
    ['iluminacao', 'Farolim traseiro direito', 'tail-light'],
    ['iluminacao', 'Farol dianteiro direito', 'headlight'],
    ['refrigeracao', 'Ventilador do radiador', 'radiator-fan'],
    ['refrigeracao', 'Radiador do motor', 'radiator'],
    ['embraiagem', 'Rolamento de embraiagem', 'clutch-bearing'],
    ['transmissao', 'Rolamento de roda', 'wheel-bearing'],
    ['consumiveis', 'Líquido limpa-vidros (5 L)', 'washer-fluid'],
    ['consumiveis', 'Óleo de motor 5W-30 (5 L)', 'engine-oil'],
    ['consumiveis', 'Líquido de travões DOT 4 (1 L)', 'brake-fluid'],
    ['carrocaria', 'Escovas limpa-vidros', 'wiper-blades'],
  ]
  for (const [category, name, key] of cases) assert.equal(partTypeOf(category, name)?.key, key, name)
  assert.equal(partTypeOf(null, 'Filtro de óleo'), null)
  assert.equal(partTypeOf('filtros', 'Peça desconhecida'), null)
})

test('illustrative photo: part type first, then the category, else none', () => {
  assert.equal(illustrativeKey('travagem', 'Pastilhas de travão'), 'brake-pads')
  // A type without its own photo uses a photo of the same category (still labelled illustrative).
  assert.equal(illustrativeKey('motor', 'Bomba de água'), 'water-pump')
  const fallback = illustrativeKey('direcao', 'Bomba de direção assistida')
  assert.ok(fallback && fallback !== 'power-steering-pump')
  assert.equal(illustrativeKey('refrigeracao', 'Radiador do motor'), 'radiator')
  assert.equal(illustrativeKey('ar-condicionado', 'Condensador de ar condicionado'), 'ac-compressor')
  assert.equal(illustrativeKey('categoria-inexistente', 'X'), null)
  const image = illustrativeImage('brake-pads')!
  assert.equal(image.src, '/images/illustrative/brake-pads-800.webp')
  assert.match(image.srcSet, /brake-pads-400\.webp 400w, .*brake-pads-800\.webp 800w/)
  assert.ok(image.credit.license && image.credit.sourceUrl.startsWith('https://commons.wikimedia.org/'))
  assert.equal(image.credit.source, 'Wikimedia Commons')
})

test('several photos per type: stable per product and spread across products', () => {
  const all = illustrativeImages('brake-disc')
  assert.ok(all.length >= 2)
  assert.equal(all[0].id, 'brake-disc')
  // Same product → same photo, every time.
  assert.equal(illustrativeImage('brake-disc', 'produto-1')?.id, illustrativeImage('brake-disc', 'produto-1')?.id)
  // Many products → more than one photo used.
  const used = new Set(Array.from({ length: 30 }, (_, i) => illustrativeImage('brake-disc', `p${i}`)?.id))
  assert.ok(used.size >= 2)
  // The gallery list starts with the product's photo and contains every photo once.
  const list = illustrativeImages('brake-disc', 'p7')
  assert.equal(list[0].id, illustrativeImage('brake-disc', 'p7')?.id)
  assert.equal(new Set(list.map((i) => i.id)).size, all.length)
  assert.equal(illustrativeById('nao-existe'), null)
  assert.equal(categoryImage('travagem')?.id, 'brake-pads')
  assert.equal(categoryImage('categoria-inexistente'), null)
})

test('imported photos get a small variant for cards; other URLs are untouched', () => {
  const url = 'https://x.supabase.co/storage/v1/object/public/product-images/products/p1/abc-1200.webp'
  assert.deepEqual(responsive(url), {
    src: url,
    srcSet: 'https://x.supabase.co/storage/v1/object/public/product-images/products/p1/abc-480.webp 480w, ' + url + ' 1200w',
  })
  assert.deepEqual(responsive('https://fornecedor.example/foto.jpg'), { src: 'https://fornecedor.example/foto.jpg' })
})
