// Stripe Checkout via the REST API (no SDK needed).
// Docs: https://docs.stripe.com/api/checkout/sessions
//       https://docs.stripe.com/webhooks#verify-manually
import {
  WebhookSignatureError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type WebhookEvent,
} from './payment-types.ts'

const API_BASE = 'https://api.stripe.com/v1'
const SIGNATURE_TOLERANCE_SECONDS = 300

interface StripeCheckoutSession {
  id: string
  url: string | null
  status: 'open' | 'complete' | 'expired'
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  amount_total: number | null
  currency: string | null
  client_reference_id: string | null
  metadata: Record<string, string> | null
}

async function stripeRequest<T>(secretKey: string, method: 'GET' | 'POST', path: string, body?: URLSearchParams): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body?.toString(),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Stripe API error ${response.status}: ${data?.error?.message ?? 'unknown'}`)
  }
  return data as T
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verifies the `Stripe-Signature` header (HMAC-SHA256 of `${timestamp}.${payload}`). */
async function verifySignature(payload: string, header: string | null, secret: string): Promise<void> {
  if (!header) throw new WebhookSignatureError('missing signature')

  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key === 't') timestamp = value
    if (key === 'v1' && value) signatures.push(value)
  }
  if (!timestamp || signatures.length === 0) throw new WebhookSignatureError('malformed signature')

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) throw new WebhookSignatureError('timestamp outside tolerance')

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)))

  if (!signatures.some((signature) => timingSafeEqual(signature, expected))) {
    throw new WebhookSignatureError('signature mismatch')
  }
}

export function createStripeProvider(secretKey: string, webhookSecret: string): PaymentProvider {
  return {
    name: 'stripe',

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      // Reuse an open session so the customer cannot end up with two payable sessions.
      if (request.existingSessionId) {
        try {
          const existing = await stripeRequest<StripeCheckoutSession>(
            secretKey,
            'GET',
            `/checkout/sessions/${encodeURIComponent(request.existingSessionId)}`,
          )
          if (existing.status === 'open' && existing.url) return { id: existing.id, url: existing.url }
        } catch {
          // Fall through and create a new session.
        }
      }

      const params = new URLSearchParams({
        mode: 'payment',
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        client_reference_id: request.paymentId,
        'metadata[payment_id]': request.paymentId,
        'metadata[shipment_id]': request.shipmentId,
        'payment_intent_data[metadata][payment_id]': request.paymentId,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': request.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(request.amountMinor),
        'line_items[0][price_data][product_data][name]': request.description,
      })
      if (request.customerEmail) params.set('customer_email', request.customerEmail)

      const session = await stripeRequest<StripeCheckoutSession>(secretKey, 'POST', '/checkout/sessions', params)
      if (!session.url) throw new Error('Stripe returned a session without URL')
      return { id: session.id, url: session.url }
    },

    async parseWebhook(request: Request): Promise<WebhookEvent> {
      const payload = await request.text()
      await verifySignature(payload, request.headers.get('stripe-signature'), webhookSecret)

      const event = JSON.parse(payload) as { type: string; data: { object: StripeCheckoutSession } }
      const session = event.data?.object
      const paymentId = session?.metadata?.payment_id ?? session?.client_reference_id
      if (!paymentId) return { kind: 'ignored', reason: `no payment_id (${event.type})` }

      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          // For delayed payment methods `completed` arrives with payment_status 'unpaid';
          // wait for `async_payment_succeeded` in that case.
          if (session.payment_status !== 'paid' || session.amount_total === null || !session.currency) {
            return { kind: 'ignored', reason: `not paid yet (${event.type})` }
          }
          return {
            kind: 'succeeded',
            paymentId,
            providerPaymentId: session.id,
            amount: session.amount_total / 100, // EUR has 2 decimal places
            currency: session.currency.toUpperCase(),
          }
        case 'checkout.session.expired':
        case 'checkout.session.async_payment_failed':
          return { kind: 'failed', paymentId, providerPaymentId: session.id }
        default:
          return { kind: 'ignored', reason: event.type }
      }
    },
  }
}
