import { useState } from 'react'
import { useI18n } from '../../i18n/context'
import { illustrativeById, illustrativeImage, responsive, type IllustrativeImage } from '../../utils/productImage'
import { ProductIllustration } from './ProductIllustration'

/**
 * A product's photo, or an illustrative photo of its part type (labelled), or the drawn
 * category illustration. Any image that fails to load falls back to the next option.
 */
export function ProductImage({
  url,
  illustrativeKey,
  seed,
  imageId,
  categorySlug,
  alt = '',
  size = 'md',
  sizes = '(max-width: 640px) 50vw, 260px',
  eager = false,
}: {
  url: string | null | undefined
  /** Part type whose illustrative photos may be shown. */
  illustrativeKey: string | null | undefined
  /** Product id: picks the same photo of the type for that product every time. */
  seed?: string
  /** A specific illustrative photo (gallery). */
  imageId?: string
  categorySlug: string | null | undefined
  alt?: string
  size?: 'sm' | 'md' | 'lg'
  /** `sizes` attribute for responsive images. */
  sizes?: string
  /** Above-the-fold images (product page) load immediately. */
  eager?: boolean
}) {
  const { t } = useI18n()
  const [failed, setFailed] = useState<{ photo?: boolean; illustrative?: boolean }>({})
  const loading = eager ? 'eager' : 'lazy'

  if (url && !failed.photo) {
    const { src, srcSet } = responsive(url)
    return (
      <img
        className="product-image"
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={() => setFailed((f) => ({ ...f, photo: true }))}
      />
    )
  }

  const illustrative = failed.illustrative ? null : imageId ? illustrativeById(imageId) : illustrativeImage(illustrativeKey, seed)
  if (illustrative) {
    return (
      <figure className={`product-image product-image-illustrative product-image-${size}`}>
        <img
          src={illustrative.src}
          srcSet={illustrative.srcSet}
          sizes={sizes}
          width={illustrative.width}
          height={illustrative.height}
          alt={alt ? `${alt} — ${t.shop.illustrative}` : t.shop.illustrative}
          loading={loading}
          decoding="async"
          onError={() => setFailed((f) => ({ ...f, illustrative: true }))}
        />
        <figcaption className="product-image-tag" title={t.shop.illustrativeHint}>
          {t.shop.illustrative}
        </figcaption>
      </figure>
    )
  }

  return <ProductIllustration categorySlug={categorySlug} size={size} />
}

/** "Imagem ilustrativa … Foto: Autor, CC BY-SA 4.0 (Wikimedia Commons)" with links. */
export function IllustrativeCredit({ image }: { image: IllustrativeImage | null | undefined }) {
  const { t } = useI18n()
  if (!image) return null
  const { credit } = image
  return (
    <p className="gallery-credit">
      {t.shop.illustrativeHint}{' '}
      <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer">
        {t.shop.photoBy} {credit.author}
      </a>
      {', '}
      {credit.licenseUrl ? (
        <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license">
          {credit.license}
        </a>
      ) : (
        credit.license
      )}{' '}
      ({credit.source})
    </p>
  )
}
