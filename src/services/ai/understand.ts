import type { CatalogSearchParams, CatalogSearchResult, VehicleModel } from '../../types'
import { catalogProvider } from '../catalog'
import { parseQuery, type ParsedQuery } from './queryParser'

/**
 * Free text → structured request (part words, make, model, year, engine, fuel, condition,
 * reference, OE). Two passes: the make first, then only that make's models, so a large
 * vehicle tree is never loaded whole into the browser.
 */
export async function understand(query: string): Promise<ParsedQuery> {
  const makes = await catalogProvider.listMakes()
  const first = parseQuery(query, makes, [])
  const models: VehicleModel[] = first.make
    ? await catalogProvider.listModels(first.make.id)
    : await catalogProvider.listModels()
  return parseQuery(query, makes, models)
}

/** True when the text carried more than part words (vehicle, year, engine, reference…). */
export function isStructured(parsed: ParsedQuery): boolean {
  return Boolean(
    parsed.make || parsed.model || parsed.year || parsed.engine || parsed.engineCc || parsed.fuel || parsed.reference || parsed.oe,
  )
}

/** Search params from what was understood (explicit filters in `base` always win). */
export function paramsFromParsed(parsed: ParsedQuery, base: CatalogSearchParams): CatalogSearchParams {
  return {
    ...base,
    query: parsed.text,
    makeId: base.makeId ?? parsed.make?.id,
    modelId: base.makeId ? base.modelId : parsed.model?.id,
    year: base.year ?? parsed.year,
    fuel: base.fuel ?? parsed.fuel,
    engineCc: base.engineCc ?? parsed.engineCc,
    engine: base.engine ?? parsed.engine,
    condition: base.condition ?? parsed.condition,
    reference: parsed.reference,
    oe: parsed.oe,
  }
}

export interface SmartSearch {
  result: CatalogSearchResult
  /** What the text was understood as (null when it was searched as plain text). */
  parsed: ParsedQuery | null
  /** Nothing matched the interpreted filters: these are plain-text results instead. */
  relaxed: boolean
}

/**
 * Shop search: interprets "pastilhas Peugeot 307 1.6 HDI 2005" into filters and searches;
 * when that finds nothing, falls back to a plain text search (flagged as relaxed).
 */
export async function smartSearch(query: string, base: CatalogSearchParams, interpret = true): Promise<SmartSearch> {
  const text = query.trim()
  const plain: CatalogSearchParams = {
    ...base,
    query: text,
    // A single token with digits may be a part / OE reference.
    reference: /^[\w.-]*\d[\w.-]*$/.test(text) && text.length >= 4 ? text : undefined,
  }
  if (!interpret || !text) return { result: await catalogProvider.searchProducts(plain), parsed: null, relaxed: false }

  const parsed = await understand(text)
  if (!isStructured(parsed)) return { result: await catalogProvider.searchProducts(plain), parsed: null, relaxed: false }

  const result = await catalogProvider.searchProducts(paramsFromParsed(parsed, base))
  if (result.total > 0) return { result, parsed, relaxed: false }
  return { result: await catalogProvider.searchProducts(plain), parsed, relaxed: true }
}
