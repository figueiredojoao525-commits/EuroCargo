import type { Fuel, PartCondition, VehicleMake, VehicleModel } from '../../types'

/**
 * What the assistant understood from a free-text request, as structured search filters.
 * Nothing here is invented: it is only extracted from the text.
 */
export interface ParsedQuery {
  original: string
  /** Remaining words used for the text search. */
  text: string
  make?: VehicleMake
  model?: VehicleModel
  year?: number
  condition?: PartCondition
  /** Part / manufacturer reference ("referência 123456", or a reference-like token). */
  reference?: string
  /** Original-equipment number ("OE 123456789"). */
  oe?: string
  /** Engine size in cc from "1.6" → 1600. */
  engineCc?: number
  /** Engine family / code, e.g. "hdi", "tdi", "dci". */
  engine?: string
  fuel?: Fuel
  /** VIN / licence plate detected (only providers that offer the lookup can use them). */
  unsupported?: 'vin' | 'plate'
  vin?: string
  plate?: string
}

export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss')
}

/** Lower-case words only (for matching vehicle names such as "Série 3 (E90)"). */
function words(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

// Condition words in the six supported languages.
const NEW_WORDS = [
  'novo',
  'nova',
  'novos',
  'novas',
  'nuevo',
  'nueva',
  'nuevos',
  'nuevas',
  'new',
  'neuf',
  'neuve',
  'neu',
  'neue',
  'neuen',
  'nuovo',
  'nuova',
  'nuovi',
]
const USED_WORDS = [
  'usado',
  'usada',
  'usados',
  'usadas',
  'used',
  'occasion',
  'gebraucht',
  'gebrauchte',
  'usato',
  'usata',
  'usati',
]

// Request phrasing that is not part of the part name ("I need a…", "Preciso de uma…"), accent-free.
const FILLER_WORDS = new Set([
  // vehicle identifiers' labels ("VIN WVW…", "FIN …", "chassis …")
  'vin',
  'fin',
  'chassis',
  'chassi',
  // pt
  'preciso',
  'precisava',
  'procuro',
  'quero',
  'queria',
  'gostaria',
  'necessito',
  'tem',
  'tens',
  'voces',
  'um',
  'uma',
  'uns',
  'umas',
  'peca',
  'pecas',
  'ola',
  'favor',
  'obrigado',
  'obrigada',
  'para',
  'meu',
  'minha',
  // es
  'necesito',
  'busco',
  'quiero',
  'quisiera',
  'tienen',
  'tiene',
  'una',
  'unos',
  'pieza',
  'piezas',
  'hola',
  'mi',
  // en
  'i',
  'need',
  'looking',
  'want',
  'would',
  'like',
  'have',
  'you',
  'do',
  'an',
  'part',
  'parts',
  'please',
  'hello',
  'hi',
  'my',
  // fr
  'je',
  'cherche',
  'besoin',
  'voudrais',
  'veux',
  'avez',
  'vous',
  'une',
  'piece',
  'pieces',
  'bonjour',
  'svp',
  'mon',
  'ma',
  // de
  'ich',
  'brauche',
  'suche',
  'benotige',
  'mochte',
  'haben',
  'sie',
  'ein',
  'eine',
  'einen',
  'teil',
  'teile',
  'hallo',
  'bitte',
  'mein',
  'meine',
  'fur',
  // it
  'ho',
  'bisogno',
  'cerco',
  'vorrei',
  'avete',
  'uno',
  'ricambio',
  'ricambi',
  'pezzo',
  'ciao',
  'per',
  'favore',
  'mio',
])

// Engine families → fuel (widely used commercial names; the fuel is implied by the name itself).
const ENGINE_FAMILIES: Record<string, Fuel> = {
  hdi: 'diesel',
  bluehdi: 'diesel',
  tdi: 'diesel',
  dci: 'diesel',
  cdi: 'diesel',
  crdi: 'diesel',
  tdci: 'diesel',
  jtd: 'diesel',
  jtdm: 'diesel',
  multijet: 'diesel',
  cdti: 'diesel',
  dtec: 'diesel',
  tsi: 'petrol',
  tfsi: 'petrol',
  fsi: 'petrol',
  vti: 'petrol',
  thp: 'petrol',
  tce: 'petrol',
  ecoboost: 'petrol',
  vtec: 'petrol',
}

const FUEL_WORDS: Record<string, Fuel> = {
  diesel: 'diesel',
  gasoleo: 'diesel',
  gasoil: 'diesel',
  gasolina: 'petrol',
  petrol: 'petrol',
  gasoline: 'petrol',
  essence: 'petrol',
  benzin: 'petrol',
  benzina: 'petrol',
  hibrido: 'hybrid',
  hybrid: 'hybrid',
  hybride: 'hybrid',
  ibrido: 'hybrid',
  eletrico: 'electric',
  electrico: 'electric',
  electric: 'electric',
  elektro: 'electric',
  gpl: 'lpg',
  glp: 'lpg',
  lpg: 'lpg',
}

// "referência 123456", "ref. 123456", "OE 123456789", "nº OE 1234" (accent-free, lower case).
const REFERENCE_PREFIX = /(?:^|\s)(referencia|referencias|reference|referenz|riferimento|ref|cod|codigo|oem|oe)\.?:?\s*(?:n[ºo.]?\s*)?([a-z0-9][a-z0-9 .\-/]{1,40}?[a-z0-9])(?=\s|$)/
const REFERENCE_WORDS = new Set(['referencia', 'referencias', 'reference', 'referenz', 'riferimento', 'ref', 'cod', 'codigo', 'oem', 'oe', 'numero', 'n'])

const MAKE_ALIASES: Record<string, string> = { vw: 'volkswagen', mercedes: 'mercedes-benz', merc: 'mercedes-benz' }

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/i
// Common EU plate shapes (PT AA-00-AA / 00-AA-00, ES 0000 AAA, FR AA-000-AA, IT AA000AA).
const PLATE_PATTERN =
  /\b([A-Z]{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-\d{2}-\d{2}|\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}|[A-Z]{2}-\d{3}-[A-Z]{2})\b/i

/** Finds `needle` (a word sequence) inside `hay` (words); returns its index or -1. */
function findSequence(hay: string[], needle: string[]): number {
  if (needle.length === 0) return -1
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((word, j) => hay[i + j] === word)) return i
  }
  return -1
}

export function parseQuery(query: string, makes: VehicleMake[], models: VehicleModel[]): ParsedQuery {
  const parsed: ParsedQuery = { original: query, text: '' }
  let source = query

  const vin = query.match(VIN_PATTERN)?.[0]
  if (vin && /\d/.test(vin) && /[a-z]/i.test(vin)) {
    parsed.unsupported = 'vin'
    parsed.vin = vin.toUpperCase()
    source = source.replace(vin, ' ')
  } else {
    const plate = query.match(PLATE_PATTERN)?.[0]
    if (plate) {
      parsed.unsupported = 'plate'
      parsed.plate = plate.toUpperCase()
      source = source.replace(plate, ' ')
    }
  }

  // Explicit "referência …" / "OE …": the value after the keyword, digits required.
  const explicit = normalize(source).match(REFERENCE_PREFIX)
  if (explicit && /\d/.test(explicit[2])) {
    const value = explicit[2].trim().toUpperCase()
    if (explicit[1] === 'oe' || explicit[1] === 'oem') parsed.oe = value
    else parsed.reference = value
    source = normalize(source).replace(explicit[0], ' ')
  }

  // Engine size "1.6" / "2,0" (litres) → cc; checked before the text is split into words.
  const litres = source.match(/(?:^|\s)([1-6])[.,]([0-9])(?=\s|[a-z]|$)/i)
  if (litres) {
    parsed.engineCc = Number(litres[1]) * 1000 + Number(litres[2]) * 100
    source = source.replace(litres[0], ' ')
  }

  // Part reference: a token with digits and 5+ chars that is not a year (e.g. "7701208174", "DEMO-307-HL-L-N").
  const tokens = parsed.reference || parsed.oe ? [] : source.split(/\s+/).filter(Boolean)
  const refToken = tokens.find((token) => {
    const clean = token.replace(/[^A-Za-z0-9-]/g, '')
    return (
      clean.replace(/-/g, '').length >= 5 &&
      /\d/.test(clean) &&
      !/^(19|20)\d{2}$/.test(clean) &&
      !VIN_PATTERN.test(clean)
    )
  })
  if (refToken) parsed.reference = refToken.replace(/[^A-Za-z0-9-]/g, '')

  let rest = words(source).filter((word) => !REFERENCE_WORDS.has(word) || !(parsed.reference || parsed.oe))

  const engineWord = rest.find((word) => Object.hasOwn(ENGINE_FAMILIES, word))
  if (engineWord) {
    parsed.engine = engineWord
    parsed.fuel = ENGINE_FAMILIES[engineWord]
  }
  const fuelWord = rest.find((word) => Object.hasOwn(FUEL_WORDS, word))
  if (fuelWord) parsed.fuel ??= FUEL_WORDS[fuelWord]
  rest = rest.filter((word) => word !== engineWord && word !== fuelWord)

  const yearIndex = rest.findIndex((word) => /^(19[5-9]\d|20[0-4]\d)$/.test(word))
  if (yearIndex >= 0) {
    parsed.year = Number(rest[yearIndex])
    rest.splice(yearIndex, 1)
  }

  const conditionIndex = rest.findIndex((word) => NEW_WORDS.includes(word) || USED_WORDS.includes(word))
  if (conditionIndex >= 0) {
    parsed.condition = USED_WORDS.includes(rest[conditionIndex]) ? 'used' : 'new'
    rest = rest.filter((word) => !NEW_WORDS.includes(word) && !USED_WORDS.includes(word))
  }

  // Make: longest make name found in the text (aliases such as "VW" included).
  const aliased = rest.map((word) => MAKE_ALIASES[word] ?? word)
  const makeMatch = [...makes]
    .map((make) => ({ make, seq: words(make.name), slug: make.slug }))
    .map((m) => ({ ...m, index: Math.max(findSequence(aliased, m.seq), aliased.indexOf(m.slug)) }))
    .filter((m) => m.index >= 0)
    .sort((a, b) => b.seq.length - a.seq.length)[0]
  if (makeMatch) {
    parsed.make = makeMatch.make
    const length = aliased[makeMatch.index] === makeMatch.slug ? 1 : makeMatch.seq.length
    rest.splice(makeMatch.index, length)
  }

  // Model: full name first ("307 SW", "Golf V"), then its first word if unambiguous ("307").
  const candidates = parsed.make ? models.filter((m) => m.make_id === parsed.make!.id) : models
  const full = candidates
    .map((model) => ({ model, seq: words(model.name) }))
    .map((m) => ({ ...m, index: findSequence(rest, m.seq) }))
    .filter((m) => m.index >= 0)
    .sort((a, b) => b.seq.length - a.seq.length)[0]
  if (full) {
    parsed.model = full.model
    rest.splice(full.index, full.seq.length)
  } else {
    const byFirstWord = candidates.filter((m) => {
      const first = words(m.name)[0]
      return first && first.length >= 3 && rest.includes(first)
    })
    if (byFirstWord.length === 1) {
      parsed.model = byFirstWord[0]
      rest.splice(rest.indexOf(words(byFirstWord[0].name)[0]), 1)
    }
  }
  if (parsed.model && !parsed.make) parsed.make = makes.find((m) => m.id === parsed.model!.make_id)

  const explicitRef = parsed.reference ?? parsed.oe
  if (explicitRef) {
    const refWords = words(explicitRef)
    rest = rest.filter((word) => !refWords.includes(word))
  }

  parsed.text = rest.filter((word) => !FILLER_WORDS.has(word)).join(' ')
  return parsed
}
