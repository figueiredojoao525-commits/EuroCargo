import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectShopQuestion } from './shopQuestions'

test('"os preços e a disponibilidade são reais ou demonstrativos?" → DEMO status first', () => {
  const q = detectShopQuestion('os preços e a disponibilidade são reais ou demonstrativos?')
  assert.deepEqual(q?.topics, ['demo', 'prices', 'availability'])
  assert.equal(q?.searchText, '')
})

test('"Os preços são reais?" asks about DEMO data and prices, with nothing to search', () => {
  const q = detectShopQuestion('Os preços são reais?')
  assert.deepEqual(q?.topics, ['demo', 'prices'])
  assert.equal(q?.searchText, '')
})

test('"Os produtos são reais?" → DEMO status', () => {
  assert.deepEqual(detectShopQuestion('Os produtos são reais?')?.topics, ['demo'])
})

test('stock, orders and payment questions in several languages', () => {
  assert.deepEqual(detectShopQuestion('Têm stock?')?.topics, ['availability'])
  assert.deepEqual(detectShopQuestion('Como faço uma encomenda?')?.topics, ['orders'])
  assert.deepEqual(detectShopQuestion('Quando pago?')?.topics, ['orders'])
  assert.deepEqual(detectShopQuestion('¿Los precios son reales?')?.topics, ['demo', 'prices'])
  assert.deepEqual(detectShopQuestion('Are the prices real?')?.topics, ['demo', 'prices'])
  assert.deepEqual(detectShopQuestion('How do I order?')?.topics, ['orders'])
  assert.deepEqual(detectShopQuestion('Les prix sont-ils réels ?')?.topics, ['demo', 'prices'])
  assert.deepEqual(detectShopQuestion('Sind die Preise echt?')?.topics, ['demo', 'prices'])
  assert.deepEqual(detectShopQuestion('I prezzi sono reali?')?.topics, ['demo', 'prices'])
})

test('a question that also names a part keeps the part words for the search', () => {
  const q = detectShopQuestion('Qual é o preço das pastilhas Golf V?')
  assert.deepEqual(q?.topics, ['prices'])
  assert.equal(q?.searchText, 'pastilhas Golf V')
})

test('ordinary part searches are not shop questions', () => {
  assert.equal(detectShopQuestion('pastilhas de travão Golf V'), null)
  assert.equal(detectShopQuestion('ótica dianteira esquerda Peugeot 307 SW 2003'), null)
  assert.equal(detectShopQuestion('Filtro de óleo Clio III usado'), null)
  // A topic word without a question is still a search ("preço" / "disponível" as filters).
  assert.equal(detectShopQuestion('preço pastilhas Golf'), null)
  assert.equal(detectShopQuestion('farol disponível Golf V'), null)
  // "cárter" must not be read as "cart".
  assert.equal(detectShopQuestion('cárter de óleo Clio?'), null)
})

test('references are never taken as question words', () => {
  assert.equal(detectShopQuestion('DEMO-307-HL-L-N'), null)
  assert.equal(detectShopQuestion('referência 0986494'), null)
  const q = detectShopQuestion('DEMO-307-HL-L-N tem stock?')
  assert.deepEqual(q?.topics, ['availability'])
  assert.equal(q?.searchText, 'DEMO-307-HL-L-N')
})
