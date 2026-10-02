import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildIndex,
  isImageFile,
  matchReference,
  normalizeRef,
  parseMapping,
  referenceFromFilename,
  storagePaths,
  type CatalogueProduct,
} from './matching'

const product = (id: string, fields: Partial<CatalogueProduct>): CatalogueProduct => ({
  id,
  sku: null,
  part_number: null,
  ean: null,
  oe_numbers: [],
  is_demo: false,
  ...fields,
})

const products = [
  product('a', { sku: 'EC-0001', part_number: '0 986 494 123', oe_numbers: ['1K0 698 151'] }),
  product('b', { sku: 'EC-0002', part_number: 'ADV-55', ean: '4047024123456' }),
  product('c', { sku: 'EC-0003', part_number: 'ADV-55' }),
  product('d', { sku: 'DEMO-307-HL-L-N', part_number: 'DEMO-307-HL-L-N', is_demo: true }),
]
const index = buildIndex(products, [{ product_id: 'a', reference_norm: 'P85075' }])
const isDemo = (id: string) => products.find((p) => p.id === id)!.is_demo

test('references are normalised like the database (normalize_ref)', () => {
  assert.equal(normalizeRef('0 986-494.123'), '0986494123')
  assert.equal(normalizeRef('1k0 698 151'), '1K0698151')
})

test('file names give the reference and the photo position', () => {
  assert.deepEqual(referenceFromFilename('fotos/0986494123.jpg'), { reference: '0986494123', position: 1 })
  assert.deepEqual(referenceFromFilename('0986494123__2.JPG'), { reference: '0986494123', position: 2 })
  assert.deepEqual(referenceFromFilename('0986494123_3.png'), { reference: '0986494123', position: 3 })
  assert.deepEqual(referenceFromFilename('1K0 698 151 (2).webp'), { reference: '1K0 698 151', position: 2 })
  assert.deepEqual(referenceFromFilename('DEMO-307-HL-L-N.jpg'), { reference: 'DEMO-307-HL-L-N', position: 1 })
  assert.equal(isImageFile('a.JPEG'), true)
  assert.equal(isImageFile('notas.txt'), false)
})

test('exact only when one product has the reference (SKU, part number, EAN, OE, indexed refs)', () => {
  assert.deepEqual(matchReference('0986494123', index, isDemo), { status: 'exact', productIds: ['a'] })
  assert.deepEqual(matchReference('1K0698151', index, isDemo), { status: 'exact', productIds: ['a'] })
  assert.deepEqual(matchReference('p85075', index, isDemo), { status: 'exact', productIds: ['a'] })
  assert.deepEqual(matchReference('4047024123456', index, isDemo), { status: 'exact', productIds: ['b'] })
  assert.deepEqual(matchReference('EC-0003', index, isDemo), { status: 'exact', productIds: ['c'] })
})

test('shared references are ambiguous, unknown ones unmatched, DEMO products protected', () => {
  assert.equal(matchReference('ADV 55', index, isDemo).status, 'ambiguous')
  assert.equal(matchReference('XYZ999', index, isDemo).status, 'unmatched')
  assert.equal(matchReference('DEMO-307-HL-L-N', index, isDemo).status, 'demo')
  assert.equal(matchReference('DEMO-307-HL-L-N', index, isDemo, { allowDemo: true }).status, 'exact')
})

test('storage paths are per product and content-addressed; mapping CSV', () => {
  const paths = storagePaths('a', 'f'.repeat(64))
  assert.equal(paths.large, `products/a/${'f'.repeat(32)}-1200.webp`)
  assert.equal(paths.small, `products/a/${'f'.repeat(32)}-480.webp`)
  const map = parseMapping('ficheiro;referencia\nIMG_0001.jpg;0986494123\n"IMG 2.png",1K0 698 151\n')
  assert.equal(map.get('img_0001.jpg'), '0986494123')
  assert.equal(map.get('img 2.png'), '1K0 698 151')
})
