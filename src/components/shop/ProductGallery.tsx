import { useState } from 'react'
import { useI18n } from '../../i18n/context'
import type { ProductImage } from '../../types'
import { responsive } from '../../utils/productImage'
import { IllustrativeCredit, ProductImage as ProductPhoto } from './ProductImage'

export function ProductGallery({
  images,
  name,
  categorySlug,
  illustrativeKey,
}: {
  images: ProductImage[]
  name: string
  /** Illustrative image when there is no photo. */
  categorySlug?: string | null
  illustrativeKey?: string | null
}) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const current = images[Math.min(index, images.length - 1)]

  if (!current) {
    return (
      <div className="gallery">
        <div className="gallery-main">
          <ProductPhoto
            url={null}
            illustrativeKey={illustrativeKey}
            categorySlug={categorySlug}
            alt={name}
            size="lg"
            sizes="(max-width: 900px) 100vw, 560px"
            eager
          />
        </div>
        <IllustrativeCredit illustrativeKey={illustrativeKey} />
      </div>
    )
  }

  return (
    <div className="gallery">
      <div className="gallery-main">
        <ProductPhoto
          key={current.id}
          url={current.url}
          illustrativeKey={illustrativeKey}
          categorySlug={categorySlug}
          alt={current.alt || name}
          size="lg"
          sizes="(max-width: 900px) 100vw, 560px"
          eager
        />
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
              <img src={responsive(image.url).srcSet?.split(' ')[0] ?? image.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
