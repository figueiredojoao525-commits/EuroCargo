import { useI18n } from '../i18n/context'
import type { ShipmentEvent } from '../types'
import { formatDateTime } from '../utils/format'
import { Icon } from './Icon'

type TimelineEvent = Pick<ShipmentEvent, 'status' | 'location' | 'description' | 'created_at'> &
  Partial<Pick<ShipmentEvent, 'occurred_at'>>

/**
 * Events are expected newest first (by when they happened). The highlighted entry is the
 * most recent one matching the shipment's current status (events can be recorded late).
 */
export function EventTimeline({
  events,
  currentStatus,
}: {
  events: TimelineEvent[]
  currentStatus?: ShipmentEvent['status']
}) {
  const { t, lang } = useI18n()
  if (events.length === 0) return <p className="empty">{t.tracking.noEvents}</p>
  const matching = currentStatus ? events.findIndex((event) => event.status === currentStatus) : -1
  const currentIndex = matching >= 0 ? matching : 0
  return (
    <ol className="timeline">
      {events.map((event, index) => {
        const when = event.occurred_at ?? event.created_at
        return (
          <li key={`${event.created_at}-${index}`} className={index === currentIndex ? 'current' : ''}>
            <div className="timeline-title">{t.status[event.status]}</div>
            <div className="timeline-meta">
              <time dateTime={when}>{formatDateTime(when, lang)}</time>
              {event.location && (
                <span className="timeline-location">
                  {' '}
                  · <Icon name="pin" size={14} /> {event.location}
                </span>
              )}
            </div>
            {event.description && <p>{event.description}</p>}
          </li>
        )
      })}
    </ol>
  )
}
