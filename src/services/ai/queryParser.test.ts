import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { VehicleMake, VehicleModel } from '../../types'
import { parseQuery } from './queryParser'

const make = (id: string, name: string): VehicleMake => ({ id, name, slug: name.toLowerCase(), active: true })
const model = (id: string, makeId: string, name: string): VehicleModel => ({
  id,
  make_id: makeId,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  body_type: null,
  year_from: null,
  year_to: null,
  active: true,
})

const makes = [make('pg', 'Peugeot'), make('op', 'Opel'), make('hy', 'Hyundai')]
const models = [model('307', 'pg', '307'), model('vec', 'op', 'Vectra'), model('acc', 'hy', 'Accent')]

test('"pastilhas Peugeot 307 1.6 HDI 2005"', () => {
  const p = parseQuery('pastilhas Peugeot 307 1.6 HDI 2005', makes, models)
  assert.equal(p.text, 'pastilhas')
  assert.equal(p.make?.id, 'pg')
  assert.equal(p.model?.id, '307')
  assert.equal(p.year, 2005)
  assert.equal(p.engineCc, 1600)
  assert.equal(p.engine, 'hdi')
  assert.equal(p.fuel, 'diesel')
  assert.equal(p.reference, undefined)
})

test('"farol esquerdo Opel Vectra 2008"', () => {
  const p = parseQuery('farol esquerdo Opel Vectra 2008', makes, models)
  assert.equal(p.text, 'farol esquerdo')
  assert.equal(p.make?.id, 'op')
  assert.equal(p.model?.id, 'vec')
  assert.equal(p.year, 2008)
})

test('"amortecedor dianteiro Hyundai Accent 1994"', () => {
  const p = parseQuery('amortecedor dianteiro Hyundai Accent 1994', makes, models)
  assert.equal(p.text, 'amortecedor dianteiro')
  assert.equal(p.model?.id, 'acc')
  assert.equal(p.year, 1994)
})

test('"referência 123456" and "OE 123456789"', () => {
  const ref = parseQuery('referência 123456', makes, models)
  assert.equal(ref.reference, '123456')
  assert.equal(ref.text, '')
  const oe = parseQuery('OE 123456789', makes, models)
  assert.equal(oe.oe, '123456789')
  assert.equal(oe.reference, undefined)
  assert.equal(oe.text, '')
})

test('bare reference token and VIN detection', () => {
  assert.equal(parseQuery('7701208174', makes, models).reference, '7701208174')
  const vin = parseQuery('filtro VF3LCRFJC74512345', makes, models)
  assert.equal(vin.unsupported, 'vin')
  assert.equal(vin.vin, 'VF3LCRFJC74512345')
  assert.equal(vin.text, 'filtro')
})

test('"VIN WVWZZZ1KZ6W123456 filtro de óleo": the VIN label is not a search word', () => {
  const p = parseQuery('VIN WVWZZZ1KZ6W123456 filtro de óleo', makes, models)
  assert.equal(p.vin, 'WVWZZZ1KZ6W123456')
  assert.equal(p.text, 'filtro de oleo')
})
