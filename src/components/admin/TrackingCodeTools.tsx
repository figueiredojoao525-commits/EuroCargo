import { useState } from 'react'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import { generateTrackingCode } from '../../services/adminOrders'
import { getErrorMessage } from '../../services/errors'
import { whatsappService } from '../../services/whatsapp'
import { Alert } from '../Alert'
import { Icon } from '../Icon'

/** Admin: issue, copy and send a shipment's tracking code. */
export function TrackingCodeTools({
  shipmentId,
  code,
  recipientPhone,
  onGenerated,
}: {
  shipmentId: string
  code: string | null
  recipientPhone?: string | null
  onGenerated: (code: string) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const trackingUrl = code ? `${window.location.origin}/rastrear?code=${code}` : ''
  const shareText = code ? interpolate(t.adminShipments.shareText, { code, url: trackingUrl }) : ''
  const whatsappLink = code ? whatsappService.linkTo(recipientPhone, shareText) : null

  async function generate() {
    setBusy(true)
    setError('')
    try {
      onGenerated(await generateTrackingCode(shipmentId))
    } catch (err) {
      setError(getErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t.adminShipments.copyFailed)
    }
  }

  return (
    <div className="tracking-tools">
      {error && <Alert tone="error">{error}</Alert>}
      {code ? (
        <>
          <span className="tracking-code-display">{code}</span>
          <div className="form-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
              <Icon name="copy" size={16} />
              {copied ? t.adminShipments.copied : t.adminShipments.copy}
            </button>
            {whatsappLink && (
              <a className="btn btn-whatsapp btn-sm" href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <Icon name="chat" size={16} />
                {t.adminShipments.sendWhatsApp}
              </a>
            )}
            <a
              className="btn btn-ghost btn-sm"
              href={`/rastrear?code=${code}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="external" size={16} />
              {t.shipment.viewTracking}
            </a>
          </div>
        </>
      ) : (
        <div className="stack">
          <p className="muted">{t.adminShipments.noCode}</p>
          <div>
            <button type="button" className="btn btn-accent" onClick={generate} disabled={busy}>
              {busy ? t.common.loading : t.adminShipments.generate}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
