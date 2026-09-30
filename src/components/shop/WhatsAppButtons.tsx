import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../i18n/context'
import { whatsappService, type WhatsAppContext, type WhatsAppRegion } from '../../services/whatsapp'
import { Icon } from '../Icon'

/**
 * EuroCargo WhatsApp button(s). One button when the customer's country is known
 * (account country, else site language PT/ES); otherwise one per country so the
 * customer chooses Portugal or Spain. Renders nothing when no number is configured.
 */
export function WhatsAppButtons({ context, size }: { context: WhatsAppContext; size?: 'sm' }) {
  const { t, lang } = useI18n()
  const { profile } = useAuth()
  if (!whatsappService.isConfigured) return null

  const region = whatsappService.resolveRegion({ country: profile?.country, lang })
  const regions: readonly WhatsAppRegion[] = region ? [region] : whatsappService.regions
  const label = (r: WhatsAppRegion) =>
    region ? t.specialist.whatsapp : r === 'PT' ? t.specialist.whatsappPt : t.specialist.whatsappEs

  return (
    <>
      {regions.map((r) => (
        <a
          key={r}
          className={`btn btn-whatsapp${size === 'sm' ? ' btn-sm' : ''}`}
          href={whatsappService.link(context, t, r)}
          target="_blank"
          rel="noopener noreferrer"
          data-region={r}
        >
          <Icon name="chat" size={size === 'sm' ? 16 : 18} />
          {label(r)}
        </a>
      ))}
    </>
  )
}
