import illustrativeData from '../data/illustrative-images.json'
import { PART_TYPES, partTypeOf } from './partTypes'

/**
 * Product images:
 * - a product's own photo (product_images: supplier feed, licensed source or EuroCargo's photo
 *   imported by reference with `npm run images:import`) — shown as is;
 * - otherwise an ILLUSTRATIVE photo of the part type (freely licensed, scripts/images/illustrative.mjs),
 *   always labelled as illustrative and credited;
 * - otherwise (or if an image fails to load) the drawn category illustration.
 */
export interface ImageCredit {
  title: string
  author: string
  license: string
  licenseUrl: string
  sourceUrl: string
  /** "Wikimedia Commons", "Pexels" or "Pixabay". */
  source: string
}

export interface IllustrativeImage {
  id: string
  src: string
  srcSet: string
  width: number
  height: number
  credit: ImageCredit
}

type Entry = { type?: string; source?: string; width: number; height: number } & Omit<ImageCredit, 'source'>
const DATA = illustrativeData as Record<string, Entry>
const WIDTHS = [400, 800]

/** Part type → its photo ids (first = main photo of the type). */
const BY_TYPE = new Map<string, string[]>()
for (const [id, entry] of Object.entries(DATA)) {
  const type = entry.type ?? id
  BY_TYPE.set(type, [...(BY_TYPE.get(type) ?? []), id])
}

/** One illustrative photo by its id (e.g. "brake-disc-2"). */
export function illustrativeById(id: string | null | undefined): IllustrativeImage | null {
  const entry = id ? DATA[id] : undefined
  if (!id || !entry) return null
  return {
    id,
    src: `/images/illustrative/${id}-800.webp`,
    srcSet: WIDTHS.map((w) => `/images/illustrative/${id}-${w}.webp ${w}w`).join(', '),
    width: entry.width,
    height: entry.height,
    credit: {
      title: entry.title,
      author: entry.author,
      license: entry.license,
      licenseUrl: entry.licenseUrl,
      sourceUrl: entry.sourceUrl,
      source: entry.source ?? 'Wikimedia Commons',
    },
  }
}

/**
 * The part type whose photos illustrate a product: its own type, else a similar type, else the first
 * type of its category that has photos. Null when nothing fits (the drawing is shown).
 */
export function illustrativeKey(categorySlug: string | null | undefined, canonicalName: string): string | null {
  const type = partTypeOf(categorySlug, canonicalName)
  if (type && BY_TYPE.has(type.key)) return type.key
  if (type?.similar && BY_TYPE.has(type.similar)) return type.similar
  return PART_TYPES.find((t) => t.category === categorySlug && BY_TYPE.has(t.key))?.key ?? null
}

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * All illustrative photos of a part type. With a `seed` (the product id) the list starts at the photo
 * that product always shows, so products of the same type are spread over the available photos.
 */
export function illustrativeImages(typeKey: string | null | undefined, seed?: string): IllustrativeImage[] {
  const ids = typeKey ? (BY_TYPE.get(typeKey) ?? []) : []
  const start = seed && ids.length ? hash(seed) % ids.length : 0
  return [...ids.slice(start), ...ids.slice(0, start)].map((id) => illustrativeById(id)!)
}

/** The photo a product shows for its type (stable per product). */
export function illustrativeImage(typeKey: string | null | undefined, seed?: string): IllustrativeImage | null {
  return illustrativeImages(typeKey, seed)[0] ?? null
}

/** Representative photo of a catalogue category (main photo of its first part type with photos). */
export function categoryImage(categorySlug: string | null | undefined): IllustrativeImage | null {
  const type = PART_TYPES.find((t) => t.category === categorySlug && BY_TYPE.has(t.key))
  return type ? illustrativeImage(type.key) : null
}

/** Number of illustrative photos available. */
export const illustrativeCount = Object.keys(DATA).length

/**
 * Photos stored by the import tool are WebP in two sizes, `<name>-1200.webp` and `<name>-480.webp`
 * (scripts/images/import.mjs): lists and cards load the small one. Other URLs are used as they are.
 */
export function responsive(url: string): { src: string; srcSet?: string } {
  const match = /^(.*\/product-images\/products\/.+)-1200\.webp$/.exec(url)
  if (!match) return { src: url }
  return { src: url, srcSet: `${match[1]}-480.webp 480w, ${url} 1200w` }
}
