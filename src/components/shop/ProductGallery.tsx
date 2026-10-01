import { useState } from 'react'
import { useI18n } from '../../i18n/context'
import type { ProductImage } from '../../types'
import { ProductIllustration } from './ProductIllustration'

export function ProductGallery({
  images,
  name,
  categorySlug,
}: {
  images: ProductImage[]
  name: string
  /** Illustrative image when there is no photo. */
  categorySlug?: string | null
}) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const current = images[Math.min(index, images.length - 1)]

  if (!current) {
    return (
      <div className="gallery">
        <div className="gallery-main">
          <ProductIllustration categorySlug={categorySlug} size="lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="gallery">
      <div className="gallery-main">
        <img src={current.url} alt={current.alt || name} decoding="async" />
      </div>
      {(current.source || current.license) && (
        <p className="gallery-credit">{[current.source, current.license].filter(Boolean).join(' · ')}</p>
      )}
      {images.length > 1 && (
        <div className="gallery-thumbs" role="group" aria-label={t.shop.gallery}>
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              className={i === index ? 'active' : ''}
              aria-pressed={i === index}
              aria-label={`${t.shop.image} ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              <img src={image.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
