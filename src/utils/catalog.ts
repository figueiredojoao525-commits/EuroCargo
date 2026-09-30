import type { IconName } from '../components/Icon'
import type { Language } from '../i18n'
import type { CatalogItem, I18nText, ProductDetail } from '../types'

/** Database text in the current language, falling back to the default (Portuguese) value. */
export function localized(fallback: string, translations: I18nText | null | undefined, lang: Language): string {
  return translations?.[lang]?.trim() || fallback
}

const CATEGORY_ICONS: Record<string, IconName> = {
  bulb: 'bulb',
  brake: 'brake',
  engine: 'engine',
  suspension: 'suspension',
  filter: 'filter',
  car: 'car',
  bolt: 'bolt',
  cooling: 'cooling',
}

export function categoryIcon(icon: string | null | undefined): IconName {
  return (icon && CATEGORY_ICONS[icon]) || 'wrench'
}

export function formatYears(from: number | null, to: number | null): string {
  if (from && to) return from === to ? String(from) : `${from}–${to}`
  if (from) return `${from}+`
  if (to) return `–${to}`
  return ''
}

/** "Peugeot 307 SW 2002–2008 · Dianteira esquerda" */
export function compatibilityLabel(c: {
  make: string | null
  model: string | null
  variant?: string | null
  year_from: number | null
  year_to: number | null
  position: string | null
}): string {
  const vehicle = [c.make, c.model, c.variant, formatYears(c.year_from, c.year_to)].filter(Boolean).join(' ')
  return c.position ? `${vehicle} · ${c.position}` : vehicle
}

/** The same shape for search results and product-page records, for ProductCard. */
export interface ProductCardData {
  id: string
  name: string
  brand: string | null
  partNumber: string | null
  condition: CatalogItem['condition']
  price: number | null
  currency: string
  availability: CatalogItem['availability']
  leadTimeDays: number | null
  image: string | null
  isDemo: boolean
  compatibility: string | null
}

export function cardFromItem(item: CatalogItem, lang: Language): ProductCardData {
  return {
    id: item.id,
    name: localized(item.name, item.name_i18n, lang),
    brand: item.brand,
    partNumber: item.part_number,
    condition: item.condition,
    price: item.price,
    currency: item.currency,
    availability: item.availability,
    leadTimeDays: item.lead_time_days,
    image: item.image,
    isDemo: item.is_demo,
    compatibility: item.compatibility[0] ? compatibilityLabel(item.compatibility[0]) : null,
  }
}

export function cardFromProduct(product: ProductDetail, lang: Language): ProductCardData {
  const c = product.product_vehicle_compatibility[0]
  return {
    id: product.id,
    name: localized(product.name, product.name_i18n, lang),
    brand: product.brand?.name ?? null,
    partNumber: product.part_number,
    condition: product.condition,
    price: product.price,
    currency: product.currency,
    availability: product.availability,
    leadTimeDays: product.lead_time_days,
    image: product.product_images[0]?.url ?? null,
    isDemo: product.is_demo,
    compatibility: c
      ? compatibilityLabel({
          make: c.make?.name ?? null,
          model: c.model?.name ?? null,
          variant: c.variant?.name,
          year_from: c.year_from,
          year_to: c.year_to,
          position: c.position,
        })
      : null,
  }
}

/** "Série 3 (E90)" → "serie-3-e90" (matches the slug CHECK constraint). */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Fills an empty `slug` from `name` before saving. */
export function withSlug(row: Record<string, unknown>): Record<string, unknown> {
  return row.slug ? row : { ...row, slug: slugify(String(row.name ?? '')) }
}
