import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/context'
import type { WhatsAppContext } from '../../services/whatsapp'
import { Icon } from '../Icon'
import { WhatsAppButtons } from './WhatsAppButtons'

/** "Talk to a specialist" (creates a request) + WhatsApp Portugal / Spain (when configured). */
export function ContactSpecialist({ context, compact = false }: { context: WhatsAppContext; compact?: boolean }) {
  const { t } = useI18n()
  const params = new URLSearchParams()
  const subject = [context.product, context.vehicle, context.year].filter(Boolean).join(' ')
  if (subject || context.question) params.set('message', [subject, context.question].filter(Boolean).join(' — '))
  if (context.vehicle) params.set('vehicle', [context.vehicle, context.year].filter(Boolean).join(' '))

  return (
    <div className={`contact-specialist${compact ? ' compact' : ''}`}>
      <Link to={`/carrinho?${params.toString()}`} className="btn btn-outline">
        <Icon name="user" size={18} />
        {t.specialist.talk}
      </Link>
      <WhatsAppButtons context={context} />
    </div>
  )
}
