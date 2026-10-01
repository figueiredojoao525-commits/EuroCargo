// Turns parsed records into canonical import rows (the shape catalog_import_rows() expects),
// validating and normalising each value. Nothing is invented: a value that is missing or
// cannot be understood is left out (and reported), never filled with a guess.
import type { Availability, Fuel, ImportMode, PartCondition } from '../../types'
import { guessField, imageKey, MULTI_COLUMN_FIELDS, vehicleKey, type ImportField } from './fields'
import type { ImportRecord, ImportValue } from './parsers'

export interface ImportVehicle {
  make: string
  model?: string
  generation?: string
  variant?: string
  engine_code?: string
  fuel?: Fuel
  engine_cc?: number
  power_kw?: number
  power_hp?: number
  year_from?: number
  year_to?: number
  position?: string
}

export interface ImportImage {
  url: string
  alt?: string
  license?: string
  source?: string
  is_primary?: boolean
}

/** Canonical row (see supabase/migrations/20261002000000_catalog_scale_import.sql). */
export interface ImportRow {
  _row: number
  external_id?: string
  sku?: string
  reference?: string
  oe_numbers?: string[]
  ean?: string
  cross_references?: { reference: string; brand?: string }[]
  name?: string
  description?: string
  brand?: string
  manufacturer?: string
  category?: string
  condition?: PartCondition
  price?: number
  currency?: string
  cost?: number
  cost_currency?: string
  stock?: number
  availability?: Availability
  lead_time_days?: number
  active?: boolean
  supplier?: string
  supplier_reference?: string
  supplier_url?: string
  images?: ImportImage[]
  vehicles?: ImportVehicle[]
  source_updated_at?: string
}

export interface PreparedRow {
  /** Line / record number in the file (header = line 1 for CSV). */
  line: number
  row: ImportRow
  errors: string[]
  warnings: string[]
}

/** column → field ('' = ignored). */
export type ColumnMapping = Record<string, ImportField | ''>

export interface PrepareOptions {
  mode: ImportMode
  /** Condition when the file has none (the source's default); otherwise the row is rejected. */
  defaultCondition?: PartCondition | null
  /** CSV: records start at line 2 (after the header). */
  firstLine?: number
}

export function autoMapping(columns: string[]): ColumnMapping {
  const used = new Set<ImportField>()
  const mapping: ColumnMapping = {}
  for (const column of columns) {
    const field = guessField(column)
    // A field is mapped automatically once (except multi-column fields such as category /
    // images / OE); repeated columns stay for the admin to decide.
    mapping[column] = field && (!used.has(field) || MULTI_COLUMN_FIELDS.has(field)) ? field : ''
    if (field) used.add(field)
  }
  // Supplier exports often have only "Descrição" as the product name.
  if (!used.has('name')) {
    const description = Object.keys(mapping).find((c) => mapping[c] === 'description')
    if (description) mapping[description] = 'name'
  }
  return mapping
}

// ─────────────── Normalisers ───────────────

const str = (value: ImportValue | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'object') {
    if (!Array.isArray(value) && typeof value['#text'] === 'string') return str(value['#text'])
    return undefined
  }
  const text = String(value).trim()
  return text === '' ? undefined : text
}

/** "1.234,56" / "1,234.56" / "12,5" / "€ 12.50" → number; undefined if empty; NaN if invalid. */
export function parseDecimal(value: ImportValue | undefined): number | undefined {
  if (typeof value === 'number') return value
  const text = str(value)?.replace(/[\s€$£]|EUR/gi, '')
  if (!text) return undefined
  let normalised = text
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > lastDot) normalised = text.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma && lastComma >= 0) normalised = text.replace(/,/g, '')
  return /^-?\d+(\.\d+)?$/.test(normalised) ? Number(normalised) : NaN
}

function parseInteger(value: ImportValue | undefined): number | undefined {
  const n = parseDecimal(value)
  if (n === undefined) return undefined
  return Number.isInteger(n) ? n : NaN
}

const words = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const CONDITIONS: Record<string, PartCondition> = {
  new: 'new', novo: 'new', nova: 'new', nuevo: 'new', nueva: 'new', neu: 'new', neuf: 'new', neuve: 'new', nuovo: 'new', n: 'new',
  used: 'used', usado: 'used', usada: 'used', usato: 'used', usata: 'used', gebraucht: 'used', occasion: 'used', u: 'used',
  'segunda mao': 'used', 'segunda mano': 'used', reconditioned: 'used', recondicionado: 'used',
}

const AVAILABILITY: Record<string, Availability> = {
  in_stock: 'in_stock', 'em stock': 'in_stock', disponivel: 'in_stock', disponible: 'in_stock', available: 'in_stock',
  instock: 'in_stock', 'in stock': 'in_stock', sim: 'in_stock', yes: 'in_stock', si: 'in_stock',
  out_of_stock: 'out_of_stock', esgotado: 'out_of_stock', esgotada: 'out_of_stock', agotado: 'out_of_stock',
  'out of stock': 'out_of_stock', outofstock: 'out_of_stock', 'sem stock': 'out_of_stock', 'sin stock': 'out_of_stock',
  on_order: 'on_order', encomenda: 'on_order', 'por encomenda': 'on_order', 'bajo pedido': 'on_order', backorder: 'on_order',
  on_request: 'on_request', consulta: 'on_request', 'sob consulta': 'on_request', consultar: 'on_request', 'on request': 'on_request',
}

const FUELS: Record<string, Fuel> = {
  petrol: 'petrol', gasolina: 'petrol', gasoline: 'petrol', benzin: 'petrol', benzina: 'petrol', essence: 'petrol',
  diesel: 'diesel', gasoleo: 'diesel', gasoil: 'diesel',
  hybrid: 'hybrid', hibrido: 'hybrid', hybride: 'hybrid', ibrido: 'hybrid',
  electric: 'electric', eletrico: 'electric', electrico: 'electric', elektro: 'electric', electrique: 'electric', elettrico: 'electric',
  lpg: 'lpg', gpl: 'lpg', glp: 'lpg', autogas: 'lpg',
  other: 'other',
}

const TRUE_WORDS = new Set(['1', 'true', 'sim', 'yes', 'si', 'x', 'ja', 'oui', 'ativo', 'activo', 'active'])
const FALSE_WORDS = new Set(['0', 'false', 'nao', 'no', 'nein', 'non', 'inativo', 'inactivo', 'inactive'])

function parseBoolean(value: ImportValue | undefined): boolean | undefined | null {
  if (typeof value === 'boolean') return value
  const text = str(value)
  if (text === undefined) return undefined
  const w = words(text)
  return TRUE_WORDS.has(w) ? true : FALSE_WORDS.has(w) ? false : null
}

/** "2002-2008", "2002–", "-2008", "05/2004 - 12/2008", "2004" → years. */
export function parseYears(value: string): { from?: number; to?: number } | null {
  const years = [...value.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0]))
  if (years.length === 0) return null
  const openEnd = /[-–—]\s*$/.test(value.trim())
  const openStart = /^\s*[-–—]/.test(value.trim())
  if (years.length === 1) return openStart ? { to: years[0] } : openEnd ? { from: years[0] } : { from: years[0], to: years[0] }
  return { from: years[0], to: years[years.length - 1] }
}

/** Lists: arrays, or text split by ";", "|", "," or new lines. */
function toList(value: ImportValue | undefined): ImportValue[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((v) => (Array.isArray(v) ? v : [v]))
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    // <images><image>…</image></images> → {image: [...]}: unwrap the single wrapper key.
    if (keys.length === 1 && typeof value[keys[0]] === 'object' && value[keys[0]] !== null) return toList(value[keys[0]])
    return [value]
  }
  return String(value)
    .split(/[;|\n]|,(?=\s*\S)/)
    .map((v) => v.trim())
    .filter(Boolean)
}

const isHttpsUrl = (value: string) => /^https:\/\/[^\s]+$/i.test(value)

// ─────────────── Row building ───────────────

type Issues = { errors: string[]; warnings: string[] }

function setNumber(
  row: ImportRow,
  key: 'price' | 'cost' | 'stock' | 'lead_time_days',
  value: ImportValue | undefined,
  issues: Issues,
) {
  const n = key === 'stock' || key === 'lead_time_days' ? parseInteger(value) : parseDecimal(value)
  if (n === undefined) return
  if (Number.isNaN(n) || n < 0) issues.errors.push(`invalid_${key}: ${str(value) ?? ''}`)
  else row[key] = key === 'price' || key === 'cost' ? Math.round(n * 100) / 100 : n
}

function buildVehicle(input: Record<string, ImportValue | undefined>, issues: Issues): ImportVehicle | null {
  const v: Partial<ImportVehicle> = {}
  for (const [rawKey, value] of Object.entries(input)) {
    const key = vehicleKey(rawKey) ?? rawKey
    const text = str(value)
    if (text === undefined) continue
    switch (key) {
      case 'make':
      case 'model':
      case 'generation':
      case 'variant':
      case 'engine_code':
      case 'position':
        v[key] = text
        break
      case 'fuel': {
        const fuel = FUELS[words(text)]
        if (fuel) v.fuel = fuel
        else issues.warnings.push(`unknown_fuel: ${text}`)
        break
      }
      case 'engine_cc':
      case 'power_kw':
      case 'power_hp': {
        const n = parseInteger(value)
        if (n !== undefined && !Number.isNaN(n) && n > 0) v[key] = n
        else issues.warnings.push(`invalid_${key}: ${text}`)
        break
      }
      case 'year_from':
      case 'year_to': {
        const years = parseYears(text)
        const year = key === 'year_from' ? years?.from : (years?.to ?? years?.from)
        if (year) v[key] = year
        else issues.warnings.push(`invalid_year: ${text}`)
        break
      }
      case 'years': {
        const years = parseYears(text)
        if (!years) issues.warnings.push(`invalid_year: ${text}`)
        else {
          v.year_from ??= years.from
          v.year_to ??= years.to
        }
        break
      }
    }
  }
  if (!v.make) {
    if (Object.keys(v).length > 0) issues.warnings.push('vehicle_without_make')
    return null
  }
  if (v.year_from && v.year_to && v.year_to < v.year_from) {
    issues.warnings.push(`invalid_years: ${v.year_from}-${v.year_to}`)
    return null
  }
  return v as ImportVehicle
}

function buildImage(value: ImportValue, defaults: { alt?: string; license?: string }): ImportImage | null {
  if (typeof value === 'string') return value.trim() ? { url: value.trim(), ...defaults } : null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const image: Partial<ImportImage> = { ...defaults }
  for (const [k, v] of Object.entries(value)) {
    const key = imageKey(k) ?? (k === '#text' ? 'url' : null)
    if (!key) continue
    if (key === 'is_primary') image.is_primary = parseBoolean(v) === true
    else {
      const text = str(v)
      if (text) image[key] = text
    }
  }
  return image.url ? (image as ImportImage) : null
}

/** One record → canonical row + issues. */
export function buildRow(record: ImportRecord, mapping: ColumnMapping, line: number, options: PrepareOptions): PreparedRow {
  const issues: Issues = { errors: [], warnings: [] }
  const row: ImportRow = { _row: line }
  const flatVehicle: Record<string, ImportValue | undefined> = {}
  let imageValues: ImportValue[] = []
  const imageDefaults: { alt?: string; license?: string } = {}

  for (const [column, field] of Object.entries(mapping)) {
    if (!field) continue
    const value = record[column]
    const text = str(value)
    switch (field) {
      case 'external_id':
      case 'sku':
      case 'reference':
      case 'name':
      case 'description':
      case 'brand':
      case 'manufacturer':
      case 'supplier':
      case 'supplier_reference':
        if (text) row[field] = text
        break
      case 'category':
        // "Família" + "Subfamília" columns → "Família > Subfamília".
        if (text) row.category = row.category ? `${row.category} > ${text}` : text
        break
      case 'ean':
        if (text) {
          const digits = text.replace(/\s/g, '')
          if (/^\d{8,14}$/.test(digits)) row.ean = digits
          else issues.warnings.push(`invalid_ean: ${text}`)
        }
        break
      case 'oe_numbers': {
        const list = toList(value).map(str).filter((v): v is string => !!v)
        if (list.length) row.oe_numbers = [...new Set([...(row.oe_numbers ?? []), ...list])].slice(0, 50)
        break
      }
      case 'cross_references': {
        const list = toList(value)
          .map((item) => {
            if (typeof item === 'object' && item && !Array.isArray(item)) {
              const reference = str(item.reference ?? item.referencia ?? item.ref ?? item.number)
              const brand = str(item.brand ?? item.marca ?? item.manufacturer)
              return reference ? { reference, brand } : null
            }
            // Text form "MARCA:REFERÊNCIA" (brand optional).
            const text = str(item)
            if (!text) return null
            const [brand, reference] = text.includes(':') ? text.split(/:(.*)/s).map((v) => v.trim()) : ['', text]
            return reference ? { reference, ...(brand ? { brand } : {}) } : null
          })
          .filter((v): v is { reference: string; brand?: string } => !!v)
        if (list.length) row.cross_references = list
        break
      }
      case 'condition':
        if (text) {
          const condition = CONDITIONS[words(text)]
          if (condition) row.condition = condition
          else issues.errors.push(`invalid_condition: ${text}`)
        }
        break
      case 'availability':
        if (text) {
          const availability = AVAILABILITY[words(text)]
          if (availability) row.availability = availability
          else issues.warnings.push(`unknown_availability: ${text}`)
        }
        break
      case 'price':
      case 'cost':
      case 'stock':
      case 'lead_time_days':
        setNumber(row, field, value, issues)
        break
      case 'currency':
      case 'cost_currency':
        if (text) {
          if (/^[A-Za-z]{3}$/.test(text)) row[field] = text.toUpperCase()
          else if (text === '€') row[field] = 'EUR'
          else issues.errors.push(`invalid_currency: ${text}`)
        }
        break
      case 'active': {
        const active = parseBoolean(value)
        if (active === null) issues.warnings.push(`invalid_boolean: ${text}`)
        else if (active !== undefined) row.active = active
        break
      }
      case 'supplier_url':
        if (text) {
          if (/^https?:\/\//i.test(text)) row.supplier_url = text
          else issues.warnings.push(`invalid_url: ${text}`)
        }
        break
      case 'source_updated_at':
        if (text) {
          const date = new Date(text)
          if (Number.isNaN(date.getTime())) issues.warnings.push(`invalid_date: ${text}`)
          else row.source_updated_at = date.toISOString()
        }
        break
      case 'images':
        imageValues = imageValues.concat(toList(value))
        break
      case 'image_alt':
        if (text) imageDefaults.alt = text
        break
      case 'image_license':
        if (text) imageDefaults.license = text
        break
      case 'vehicles': {
        const vehicles = toList(value)
          .map((item) =>
            typeof item === 'object' && item && !Array.isArray(item)
              ? buildVehicle(item as Record<string, ImportValue>, issues)
              : null,
          )
          .filter((v): v is ImportVehicle => !!v)
        if (vehicles.length) row.vehicles = [...(row.vehicles ?? []), ...vehicles]
        break
      }
      default:
        // vehicle_* columns: one vehicle per row.
        flatVehicle[field.slice('vehicle_'.length)] = value
    }
  }

  if (Object.values(flatVehicle).some((v) => str(v) !== undefined)) {
    const vehicle = buildVehicle(flatVehicle, issues)
    if (vehicle) row.vehicles = [...(row.vehicles ?? []), vehicle]
  }

  if (imageValues.length) {
    const images: ImportImage[] = []
    for (const value of imageValues) {
      const image = buildImage(value, imageDefaults)
      if (!image) continue
      if (!isHttpsUrl(image.url)) issues.warnings.push(`image_not_https: ${image.url}`)
      else images.push(image)
    }
    // The flagged primary image first (the database makes the first image primary).
    images.sort((a, b) => Number(b.is_primary ?? false) - Number(a.is_primary ?? false))
    if (images.length) row.images = images
    if (images.some((i) => !i.license)) issues.warnings.push('image_without_license')
  }

  // Validation that depends on several fields.
  if (!row.external_id && !row.sku && !(row.reference && row.brand)) issues.errors.push('missing_identifier')
  if (options.mode !== 'update_only') {
    if (!row.name || row.name.length < 2) issues.errors.push('missing_name')
    if (!row.condition && !options.defaultCondition) issues.errors.push('missing_condition')
  }
  if (row.cost !== undefined && !row.supplier) issues.warnings.push('cost_without_supplier')

  return { line, row, errors: issues.errors, warnings: issues.warnings }
}

/** Key that identifies the same product (as the database matches it). */
export function rowKey(row: ImportRow, defaultCondition?: PartCondition | null): string | null {
  if (row.external_id) return `ext:${row.external_id}`
  if (row.sku) return `sku:${row.sku}`
  if (row.reference && row.brand) {
    const ref = row.reference.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return `ref:${row.brand.toLowerCase()}:${ref}:${row.condition ?? defaultCondition ?? ''}`
  }
  return null
}

function mergeRows(target: ImportRow, extra: ImportRow) {
  const out = target as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(extra) as [keyof ImportRow, unknown][]) {
    if (value === undefined || key === '_row') continue
    if (key === 'vehicles' || key === 'images' || key === 'cross_references') {
      const list = [...((target[key] as unknown[]) ?? []), ...(value as unknown[])]
      const seen = new Set<string>()
      out[key] = list.filter((item) => {
        const k = JSON.stringify(item)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    } else if (key === 'oe_numbers') {
      target.oe_numbers = [...new Set([...(target.oe_numbers ?? []), ...(value as string[])])].slice(0, 50)
    } else if (target[key] === undefined) {
      out[key] = value
    }
  }
}

export interface PreparedImport {
  rows: PreparedRow[]
  /** Rows ready to send (no errors), merged by product. */
  valid: ImportRow[]
  invalidCount: number
  /** Records merged into a previous row of the same product (e.g. one line per vehicle). */
  mergedCount: number
}

/**
 * Builds and validates every record. Records of the same product (same source id,
 * SKU or brand + reference + condition) are merged: one product with all its vehicles,
 * images and OE numbers — the file never creates duplicates.
 */
export function prepareImport(records: ImportRecord[], mapping: ColumnMapping, options: PrepareOptions): PreparedImport {
  const first = options.firstLine ?? 1
  const rows = records.map((record, i) => buildRow(record, mapping, first + i, options))
  const byKey = new Map<string, ImportRow>()
  const valid: ImportRow[] = []
  let mergedCount = 0
  for (const prepared of rows) {
    if (prepared.errors.length) continue
    const key = rowKey(prepared.row, options.defaultCondition)
    const existing = key ? byKey.get(key) : undefined
    if (existing) {
      mergeRows(existing, prepared.row)
      prepared.warnings.push(`merged_into_line: ${existing._row}`)
      mergedCount++
    } else {
      const copy = structuredClone(prepared.row)
      if (key) byKey.set(key, copy)
      valid.push(copy)
    }
  }
  return { rows, valid, invalidCount: rows.filter((r) => r.errors.length).length, mergedCount }
}
