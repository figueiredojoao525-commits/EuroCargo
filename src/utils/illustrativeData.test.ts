import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import data from '../data/illustrative-images.json'
import { PART_TYPES } from './partTypes'
import { categoryTypes, illustrativeKey } from './productImage'

type Entry = (typeof data)[keyof typeof data] & { type: string; source?: string }
const entries = Object.entries(data as Record<string, Entry>)
const ALLOWED = /^(cc0|public domain|pd\b|cc[- ]by(-sa)?[- ]\d(\.\d)?)/i

test('every illustrative photo is on disk, small, credited and freely licensed', () => {
  for (const [id, e] of entries) {
    for (const w of [400, 800]) {
      const file = join(process.cwd(), 'public/images/illustrative', `${id}-${w}.webp`)
      assert.ok(existsSync(file), `${id}-${w}.webp em falta`)
      assert.ok(statSync(file).size < 250_000, `${id}-${w}.webp demasiado grande`)
    }
    assert.ok(e.author && e.license && e.sourceUrl && e.title, `${id}: crédito incompleto`)
    if ((e.source ?? 'Wikimedia Commons') === 'Wikimedia Commons') {
      assert.match(e.license, ALLOWED, `${id}: licença ${e.license}`)
      assert.ok(!/\b(nc|nd)\b/i.test(e.license), `${id}: licença ${e.license}`)
      assert.ok(e.sourceUrl.startsWith('https://commons.wikimedia.org/'), `${id}: origem`)
    }
    assert.ok(PART_TYPES.some((t) => t.key === e.type), `${id}: tipo ${e.type} desconhecido`)
  }
})

test('no photo is used twice (same file or same content)', () => {
  const origins = entries.map(([, e]) => (e as Entry & { origin?: string }).origin ?? e.title)
  assert.equal(new Set(origins).size, origins.length)
  const hashes = entries.map(([, e]) => e.sha256)
  assert.equal(new Set(hashes).size, hashes.length)
})

test('categories page lists only types with photos, from the right category', () => {
  const brakes = categoryTypes('travagem').map((x) => x.type.key)
  assert.ok(brakes.includes('brake-pads') && brakes.includes('brake-drum'))
  for (const { type, image } of categoryTypes('eletrico')) {
    assert.equal(type.category, 'eletrico')
    assert.ok(image.src.endsWith('-800.webp'))
  }
  // Existing catalogue products keep matching their own type.
  assert.equal(illustrativeKey('eletrico', 'Motor de arranque'), 'starter-motor')
  assert.equal(illustrativeKey('travagem', 'Disco de travão dianteiro'), 'brake-disc')
})
