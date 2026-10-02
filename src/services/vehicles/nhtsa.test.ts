import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VIN_PATTERN, parseVinResult, sameName } from './nhtsa'

test('complete decode (US-market vehicle): make, model, year, fuel and engine', () => {
  const d = parseVinResult({
    Make: 'HONDA',
    Model: 'Accord',
    ModelYear: '2003',
    FuelTypePrimary: 'Gasoline',
    DisplacementL: '2.4',
    ErrorCode: '0',
  })
  assert.deepEqual(d, { make: 'HONDA', model: 'Accord', year: 2003, fuel: 'petrol', engineCc: 2400, complete: true })
})

test('European VIN with errors: only the manufacturer is trusted', () => {
  const d = parseVinResult({ Make: 'PEUGEOT', Model: '', ModelYear: '2007', FuelTypePrimary: '', ErrorCode: '1,8,400' })
  assert.deepEqual(d, { make: 'PEUGEOT', model: null, year: null, fuel: null, engineCc: null, complete: false })
})

test('nothing decoded', () => {
  const d = parseVinResult({ Make: '', ErrorCode: '1,8,400' })
  assert.equal(d.make, null)
})

test('VIN format and name matching', () => {
  assert.ok(VIN_PATTERN.test('1HGCM82633A004352'))
  assert.ok(!VIN_PATTERN.test('1HGCM82633A00435')) // 16 characters
  assert.ok(!VIN_PATTERN.test('1HGCM82633A00435O')) // O is not allowed in VINs
  assert.ok(sameName('MERCEDES-BENZ', 'Mercedes-Benz'))
  assert.ok(sameName('CITROËN', 'Citroen'))
  assert.ok(!sameName('MINI', 'Mini Cooper'))
})
