import assert from 'node:assert/strict'
import { test } from 'node:test'
import { partTypeOf } from './partTypes'
import { illustrativeImage, illustrativeKey, responsive } from './productImage'

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
  const fallback = illustrativeKey('motor', 'Bomba de água')
  assert.ok(fallback && fallback !== 'water-pump')
  assert.equal(illustrativeKey('categoria-inexistente', 'X'), null)
  const image = illustrativeImage('brake-pads')!
  assert.equal(image.src, '/images/illustrative/brake-pads-800.webp')
  assert.match(image.srcSet, /brake-pads-400\.webp 400w, .*brake-pads-800\.webp 800w/)
  assert.ok(image.credit.license && image.credit.sourceUrl.startsWith('https://commons.wikimedia.org/'))
})

test('imported photos get a small variant for cards; other URLs are untouched', () => {
  const url = 'https://x.supabase.co/storage/v1/object/public/product-images/products/p1/abc-1200.webp'
  assert.deepEqual(responsive(url), {
    src: url,
    srcSet: 'https://x.supabase.co/storage/v1/object/public/product-images/products/p1/abc-480.webp 480w, ' + url + ' 1200w',
  })
  assert.deepEqual(responsive('https://fornecedor.example/foto.jpg'), { src: 'https://fornecedor.example/foto.jpg' })
})
