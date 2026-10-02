import { useState } from 'react'
import { useI18n } from '../../i18n/context'
import type { ProductImage } from '../../types'
import { illustrativeImages, responsive } from '../../utils/productImage'
import { IllustrativeCredit, ProductImage as ProductPhoto } from './ProductImage'

export function ProductGallery({
  images,
  name,
  categorySlug,
  illustrativeKey,
  productId,
}: {
  images: ProductImage[]
  name: string
  /** Illustrative image when there is no photo. */
  categorySlug?: string | null
  illustrativeKey?: string | null
  productId?: string
}) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const current = images[Math.min(index, images.length - 1)]

  // No photo of the product itself: the illustrative photos of its part type (all labelled and credited).
  if (!current) {
    const examples = illustrativeImages(illustrativeKey, productId)
    const example = examples[Math.min(index, examples.length - 1)]
    return (
      <div className="gallery">
        <div className="gallery-main">
          <ProductPhoto
            key={example?.id ?? 'none'}
            url={null}
            illustrativeKey={illustrativeKey}
            imageId={example?.id}
            categorySlug={categorySlug}
            alt={name}
            size="lg"
            sizes="(max-width: 900px) 100vw, 560px"
            eager
          />
        </div>
        <IllustrativeCredit image={example} />
        {examples.length > 1 && (
          <div className="gallery-thumbs" role="group" aria-label={t.shop.gallery}>
            {examples.map((image, i) => (
              <button
                key={image.id}
                type="button"
                className={i === index ? 'active' : ''}
                aria-pressed={i === index}
                aria-label={`${t.shop.illustrative} ${i + 1}`}
                onClick={() => setIndex(i)}
              >
                <img src={image.src.replace(/-800\.webp$/, '-400.webp')} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
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
          seed={productId}
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
