/**
 * Matching photo files to catalogue products by reference (used by scripts/images/import.mjs).
 *
 * A file is "exact" only when its name (or a mapping CSV line) gives a reference that belongs to
 * exactly ONE product: SKU, manufacturer part number, EAN, OE number or any indexed reference.
 * Several products → "ambiguous" (left pending); none → "unmatched". DEMO products are never
 * matched unless explicitly allowed: a real photo must not make a DEMO product look real.
 */

/** Same rule as the SQL public.normalize_ref(): upper case, letters and digits only. */
export function normalizeRef(value: string | null | undefined): string {
  return (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif|tiff?|gif|heic)$/i

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.test(name)
}

/**
 * "0986494123.jpg" → "0986494123"; extra photos of the same part: "0986494123__2.jpg",
 * "0986494123_2.jpg" or "0986494123 (2).jpg" → same reference, position 2.
 */
export function referenceFromFilename(fileName: string): { reference: string; position: number } {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim()
  const variant = /^(.*?)(?:__?(\d{1,2})| \((\d{1,2})\))$/.exec(base)
  if (variant && variant[1]) return { reference: variant[1].trim(), position: Number(variant[2] ?? variant[3]) }
  return { reference: base, position: 1 }
}

export interface CatalogueProduct {
  id: string
  sku: string | null
  part_number: string | null
  ean: string | null
  oe_numbers: string[] | null
  is_demo: boolean
}

export interface ProductReference {
  product_id: string
  reference_norm: string
}

export type ReferenceIndex = Map<string, Set<string>>

export function buildIndex(products: CatalogueProduct[], references: ProductReference[] = []): ReferenceIndex {
  const index: ReferenceIndex = new Map()
  const add = (ref: string | null | undefined, id: string) => {
    const norm = normalizeRef(ref)
    if (norm.length < 3) return
    if (!index.has(norm)) index.set(norm, new Set())
    index.get(norm)!.add(id)
  }
  for (const p of products) {
    add(p.sku, p.id)
    add(p.part_number, p.id)
    add(p.ean, p.id)
    for (const oe of p.oe_numbers ?? []) add(oe, p.id)
  }
  for (const r of references) add(r.reference_norm, r.product_id)
  return index
}

export type MatchStatus = 'exact' | 'ambiguous' | 'unmatched' | 'demo'

export interface MatchResult {
  status: MatchStatus
  productIds: string[]
}

export function matchReference(
  reference: string,
  index: ReferenceIndex,
  isDemo: (productId: string) => boolean,
  options: { allowDemo?: boolean } = {},
): MatchResult {
  const ids = [...(index.get(normalizeRef(reference)) ?? [])]
  if (ids.length === 0) return { status: 'unmatched', productIds: [] }
  const usable = options.allowDemo ? ids : ids.filter((id) => !isDemo(id))
  if (usable.length === 0) return { status: 'demo', productIds: ids }
  if (usable.length > 1) return { status: 'ambiguous', productIds: usable }
  return { status: 'exact', productIds: usable }
}

/** Storage layout in the public bucket "product-images": one folder per product, content-addressed files. */
export function storagePaths(productId: string, hash: string): { large: string; small: string } {
  const name = hash.slice(0, 32)
  return { large: `products/${productId}/${name}-1200.webp`, small: `products/${productId}/${name}-480.webp` }
}

/** "ficheiro;referencia" / "file,reference" CSV (header optional) → file name → reference. */
export function parseMapping(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cells.length < 2 || !cells[0] || !cells[1]) continue
    if (/^(ficheiro|file|arquivo|fichero|nome|name)$/i.test(cells[0])) continue
    map.set(cells[0].toLowerCase(), cells[1])
  }
  return map
}
