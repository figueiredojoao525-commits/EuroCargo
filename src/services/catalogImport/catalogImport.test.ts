import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoMapping, parseDecimal, parseYears, prepareImport } from './mapping'
import { parseCsv, parseFile, parseJson, parseXml } from './parsers'

test('CSV: delimiter detection, quotes, escaped quotes, CRLF, BOM, multi-line cells', () => {
  const csv = '﻿Referência;Nome;Preço\r\n"GDB 1330";"Pastilhas ""Premium""";12,50\r\n"A1";"Linha\nnova";\r\n\r\n'
  const { records, columns } = parseCsv(csv)
  assert.deepEqual(columns, ['Referência', 'Nome', 'Preço'])
  assert.equal(records.length, 2)
  assert.equal(records[0]['Nome'], 'Pastilhas "Premium"')
  assert.equal(records[1]['Nome'], 'Linha\nnova')
  assert.equal(records[1]['Preço'], '')
})

test('CSV: unclosed quote is an error', () => {
  assert.throws(() => parseCsv('a,b\n"x,1\n'), /csv_unclosed_quote/)
})

test('JSON: array or wrapper object', () => {
  assert.equal(parseJson('[{"sku":"A"},{"sku":"B"}]').records.length, 2)
  assert.equal(parseJson('{"meta":{},"products":[{"sku":"A"}]}').records[0].sku, 'A')
  assert.throws(() => parseJson('{oops'), /json_invalid/)
})

test('XML: repeated elements, attributes, nested lists, CDATA and entities', () => {
  const xml = `<?xml version="1.0"?>
  <feed><meta><date>2026-10-01</date></meta>
    <products>
      <product id="P1"><name><![CDATA[Farol <esq>]]></name><brand>Valeo &amp; Co</brand>
        <oe>A</oe><oe>B</oe>
        <vehicles><vehicle><make>Opel</make><model>Vectra</model><years>2002-2008</years></vehicle></vehicles>
      </product>
      <product id="P2"><name>Filtro</name><brand>MANN</brand></product>
    </products>
  </feed>`
  const { records } = parseXml(xml)
  assert.equal(records.length, 2)
  assert.equal(records[0].id, 'P1')
  assert.equal(records[0].name, 'Farol <esq>')
  assert.equal(records[0].brand, 'Valeo & Co')
  assert.deepEqual(records[0].oe, ['A', 'B'])
  assert.throws(() => parseXml('<a><b></a>'), /xml_mismatched_tag/)
})

test('XML: a single product is still one record', () => {
  const { records } = parseXml('<products><product><sku>X</sku></product></products>')
  assert.deepEqual(records, [{ sku: 'X' }])
})

test('number and year parsing', () => {
  assert.equal(parseDecimal('1.234,56'), 1234.56)
  assert.equal(parseDecimal('1,234.56'), 1234.56)
  assert.equal(parseDecimal('€ 12,5'), 12.5)
  assert.equal(parseDecimal(''), undefined)
  assert.ok(Number.isNaN(parseDecimal('abc')))
  assert.deepEqual(parseYears('05/2004 - 12/2008'), { from: 2004, to: 2008 })
  assert.deepEqual(parseYears('2010-'), { from: 2010 })
  assert.deepEqual(parseYears('-1999'), { to: 1999 })
})

test('auto mapping recognises PT/ES/EN/DE column names', () => {
  const mapping = autoMapping(['Referência', 'Marca', 'Preço', 'Custo', 'Fornecedor', 'Marca veículo', 'Modelo', 'Anos', 'OE', 'Imagem', 'Coluna X'])
  assert.equal(mapping['Referência'], 'reference')
  assert.equal(mapping['Marca'], 'brand')
  assert.equal(mapping['Preço'], 'price')
  assert.equal(mapping['Custo'], 'cost')
  assert.equal(mapping['Fornecedor'], 'supplier')
  assert.equal(mapping['Marca veículo'], 'vehicle_make')
  assert.equal(mapping['Modelo'], 'vehicle_model')
  assert.equal(mapping['Anos'], 'vehicle_years')
  assert.equal(mapping['OE'], 'oe_numbers')
  assert.equal(mapping['Imagem'], 'images')
  assert.equal(mapping['Coluna X'], '')
})

test('prepareImport: validation, normalisation and merging one-vehicle-per-line files', () => {
  const csv = [
    'Referência;Marca;Nome;Estado;Preço;Stock;OE;Marca veículo;Modelo;Anos;Imagem;Licença',
    'GDB1330;TRW;Pastilhas dianteiras;Novo;34,90;4;425214|4252 15;Peugeot;307;2001-2008;https://cdn.x/a.jpg;Licença TRW',
    'GDB1330;TRW;Pastilhas dianteiras;Novo;34,90;4;425214;Citroën;C4;2004-2010;;',
    ';;Sem identificador;Novo;10;;;;;;;',
    'X9;Bosch;Escovas;Talvez;abc;;;;;;http://inseguro/x.jpg;',
  ].join('\n')
  const { records, columns } = parseCsv(csv)
  const result = prepareImport(records, autoMapping(columns), { mode: 'upsert', firstLine: 2 })
  assert.equal(result.valid.length, 1)
  assert.equal(result.invalidCount, 2)
  assert.equal(result.mergedCount, 1)

  const row = result.valid[0]
  assert.equal(row.price, 34.9)
  assert.equal(row.stock, 4)
  assert.equal(row.condition, 'new')
  assert.deepEqual(row.oe_numbers, ['425214', '4252 15'])
  assert.deepEqual(
    row.vehicles?.map((v) => `${v.make} ${v.model} ${v.year_from}-${v.year_to}`),
    ['Peugeot 307 2001-2008', 'Citroën C4 2004-2010'],
  )
  assert.deepEqual(row.images, [{ url: 'https://cdn.x/a.jpg', license: 'Licença TRW' }])

  assert.ok(result.rows[2].errors.includes('missing_identifier'))
  const bad = result.rows[3]
  assert.ok(bad.errors.some((e) => e.startsWith('invalid_condition')))
  assert.ok(bad.errors.some((e) => e.startsWith('invalid_price')))
  assert.ok(bad.warnings.some((w) => w.startsWith('image_not_https')))
})

test('prepareImport: nothing is invented (missing values stay missing)', () => {
  const { records, columns } = parseCsv('sku;nome;estado\nA-1;Alternador;usado\n')
  const { valid } = prepareImport(records, autoMapping(columns), { mode: 'upsert' })
  assert.deepEqual(valid[0], { _row: 1, sku: 'A-1', name: 'Alternador', condition: 'used' })
})

test('prepareImport: condition required unless the source has a default; update_only needs no name', () => {
  const { records, columns } = parseCsv('sku;preco\nA-1;10\n')
  const mapping = autoMapping(columns)
  assert.ok(prepareImport(records, mapping, { mode: 'upsert' }).rows[0].errors.includes('missing_condition'))
  assert.equal(prepareImport(records, mapping, { mode: 'update_only' }).valid.length, 1)
})

test('JSON with structured vehicles and images', () => {
  const json = JSON.stringify({
    items: [
      {
        external_id: 'T-1',
        name: 'Amortecedor dianteiro',
        brand: 'Sachs',
        condition: 'new',
        images: [{ url: 'https://img/1.jpg', license: 'TecDoc', primary: true }],
        vehicles: [{ make: 'Hyundai', model: 'Accent', year_from: 1994, year_to: 1999, fuel: 'Gasolina', engine_cc: '1341' }],
      },
    ],
  })
  const parsed = parseFile('feed.json', json)
  const { valid } = prepareImport(parsed.records, autoMapping(parsed.columns), { mode: 'upsert' })
  assert.equal(valid[0].vehicles?.[0].fuel, 'petrol')
  assert.equal(valid[0].vehicles?.[0].engine_cc, 1341)
  assert.equal(valid[0].images?.[0].is_primary, true)
})

test('documented example files (docs/examples) parse and validate', async () => {
  const { readFileSync } = await import('node:fs')
  const expected: Record<string, { valid: number; invalid: number }> = {
    'catalogo-exemplo.csv': { valid: 1, invalid: 0 }, // two lines of the same product (one per vehicle) → merged
    'catalogo-exemplo.json': { valid: 1, invalid: 0 },
    'catalogo-exemplo.xml': { valid: 2, invalid: 0 },
  }
  for (const [name, counts] of Object.entries(expected)) {
    const text = readFileSync(`docs/examples/${name}`, 'utf8')
    const parsed = parseFile(name, text)
    const result = prepareImport(parsed.records, autoMapping(parsed.columns), {
      mode: 'upsert',
      firstLine: parsed.format === 'csv' ? 2 : 1,
    })
    assert.equal(result.valid.length, counts.valid, `${name}: ${JSON.stringify(result.rows.map((r) => r.errors))}`)
    assert.equal(result.invalidCount, counts.invalid, name)
  }
  const csv = parseFile('x.csv', readFileSync('docs/examples/catalogo-exemplo.csv', 'utf8'))
  const row = prepareImport(csv.records, autoMapping(csv.columns), { mode: 'upsert', firstLine: 2 }).valid[0]
  assert.equal(row.price, undefined) // no public price in the file → stays empty (rules / on request)
  assert.equal(row.cost, 20)
  assert.equal(row.vehicles?.length, 2)
  assert.equal(row.vehicles?.[0].fuel, 'diesel')
})

test('multi-column fields: Família + Subfamília → category path; several image / OE columns merged', () => {
  const csv = 'Código;Marca;Descrição;Estado;Família;Subfamília;Imagem 1;Imagem 2;OE 1;OE 2\nA1;Marca;Peça;novo;Travagem;Pastilhas;https://x/1.jpg;https://x/2.jpg;111;222\n'
  const { records, columns } = parseCsv(csv)
  const mapping = autoMapping(columns)
  assert.equal(mapping['Família'], 'category')
  assert.equal(mapping['Subfamília'], 'category')
  const { valid } = prepareImport(records, mapping, { mode: 'upsert' })
  assert.equal(valid[0].category, 'Travagem > Pastilhas')
  assert.deepEqual(valid[0].images?.map((i) => i.url), ['https://x/1.jpg', 'https://x/2.jpg'])
  assert.deepEqual(valid[0].oe_numbers, ['111', '222'])
})

test('every canonical field name maps to itself (template headers)', async () => {
  const { IMPORT_FIELDS } = await import('./fields')
  const mapping = autoMapping([...IMPORT_FIELDS])
  for (const field of IMPORT_FIELDS) assert.equal(mapping[field], field, field)
})

test('import template headers all map to the intended fields', async () => {
  const { readFileSync } = await import('node:fs')
  const header = readFileSync('public/templates/modelo-importacao-eurocargo.csv', 'utf8').trim()
  const mapping = autoMapping(header.split(';'))
  const unmapped = Object.entries(mapping).filter(([, f]) => !f).map(([c]) => c)
  assert.deepEqual(unmapped, [])
  assert.equal(mapping['Código artigo'], 'external_id')
  assert.equal(mapping['Nome'], 'name')
  assert.equal(mapping['Descrição'], 'description')
  assert.equal(mapping['Marca'], 'brand')
  assert.equal(mapping['Marca veículo'], 'vehicle_make')
  assert.equal(mapping['Equivalências'], 'cross_references')
  assert.equal(mapping['Licença imagem'], 'image_license')
  assert.equal(mapping['CV'], 'vehicle_power_hp')
})

test('realistic supplier example: products, merged vehicles, prices by rules, warnings', async () => {
  const { readFileSync } = await import('node:fs')
  const parsed = parseFile('exemplo-fornecedor.csv', readFileSync('docs/examples/exemplo-fornecedor.csv', 'utf8'))
  const result = prepareImport(parsed.records, autoMapping(parsed.columns), { mode: 'upsert', firstLine: 2 })
  assert.equal(parsed.records.length, 8)
  assert.equal(result.invalidCount, 0, JSON.stringify(result.rows.map((r) => r.errors)))
  assert.equal(result.valid.length, 6)
  assert.equal(result.mergedCount, 2)
  const pads = result.valid.find((r) => r.external_id === 'FX-100234')!
  assert.equal(pads.price, undefined) // cost only → public price from the pricing rules
  assert.equal(pads.cost, 18.4)
  assert.equal(pads.category, 'Travagem > Pastilhas')
  assert.deepEqual(pads.cross_references, [{ reference: 'EX-OT-778', brand: 'OutraMarcaExemplo' }])
  assert.deepEqual(pads.vehicles?.map((v) => `${v.make} ${v.model} ${v.engine_code} ${v.year_from}-${v.year_to}`), [
    'Peugeot 307 9HZ 2004-2008',
    'Citroën C4 9HZ 2004-2010',
  ])
  assert.equal(pads.images?.length, 2)
  const used = result.valid.find((r) => r.external_id === 'US-000045')!
  assert.equal(used.condition, 'used')
  assert.equal(used.price, 85)
  const disc = result.valid.find((r) => r.external_id === 'FX-100567')!
  assert.equal(disc.availability, 'out_of_stock')
  const shock = result.valid.find((r) => r.external_id === 'FX-300112')!
  assert.equal(shock.availability, 'on_order')
  assert.equal(shock.lead_time_days, 5)
  const battery = result.rows.find((r) => r.row.external_id === 'FX-400777')!
  assert.ok(battery.warnings.includes('image_without_license')) // image skipped by the database
})
