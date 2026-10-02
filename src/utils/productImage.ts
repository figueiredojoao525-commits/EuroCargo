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
}

export interface IllustrativeImage {
  key: string
  src: string
  srcSet: string
  width: number
  height: number
  credit: ImageCredit
}

type Entry = { width: number; height: number } & ImageCredit
const DATA = illustrativeData as Record<string, Entry>
const WIDTHS = [400, 800]

function build(key: string): IllustrativeImage | null {
  const entry = DATA[key]
  if (!entry) return null
  return {
    key,
    src: `/images/illustrative/${key}-800.webp`,
    srcSet: WIDTHS.map((w) => `/images/illustrative/${key}-${w}.webp ${w}w`).join(', '),
    width: entry.width,
    height: entry.height,
    credit: {
      title: entry.title,
      author: entry.author,
      license: entry.license,
      licenseUrl: entry.licenseUrl,
      sourceUrl: entry.sourceUrl,
    },
  }
}

/** Key of the illustrative photo for a product: its part type, else the first photo of its category. */
export function illustrativeKey(categorySlug: string | null | undefined, canonicalName: string): string | null {
  const type = partTypeOf(categorySlug, canonicalName)
  if (type && DATA[type.key]) return type.key
  if (type?.similar && DATA[type.similar]) return type.similar
  return PART_TYPES.find((t) => t.category === categorySlug && DATA[t.key])?.key ?? null
}

export function illustrativeImage(key: string | null | undefined): IllustrativeImage | null {
  return key ? build(key) : null
}

/**
 * Photos stored by the import tool are WebP in two sizes, `<name>-1200.webp` and `<name>-480.webp`
 * (scripts/images/import.mjs): lists and cards load the small one. Other URLs are used as they are.
 */
export function responsive(url: string): { src: string; srcSet?: string } {
  const match = /^(.*\/product-images\/products\/.+)-1200\.webp$/.exec(url)
  if (!match) return { src: url }
  return { src: url, srcSet: `${match[1]}-480.webp 480w, ${url} 1200w` }
}
