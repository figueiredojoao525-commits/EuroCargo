import { useI18n } from '../../i18n/context'
import { categoryIconBySlug, categoryHue } from '../../utils/catalog'
import { Icon } from '../Icon'

/**
 * Illustrative image for products without a photo (DEMO catalogue, or real products whose
 * supplier sends no licensed image). Always labelled "illustrative" — never a fake photo.
 */
export function ProductIllustration({
  categorySlug,
  size = 'md',
}: {
  categorySlug: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
}) {
  const { t } = useI18n()
  const hue = categoryHue(categorySlug)
  const iconSize = size === 'lg' ? 96 : size === 'md' ? 52 : 34
  return (
    <div className={`illustration illustration-${size}`} style={{ ['--ill-hue' as string]: hue }} role="img" aria-label={t.shop.illustrative}>
      <span className="illustration-icon">
        <Icon name={categoryIconBySlug(categorySlug)} size={iconSize} />
      </span>
      {size !== 'sm' && <span className="illustration-caption">{t.shop.illustrative}</span>}
    </div>
  )
}
