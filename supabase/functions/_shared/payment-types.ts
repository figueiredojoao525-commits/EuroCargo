// Types shared by all payment providers.
export interface CheckoutRequest {
  paymentId: string
  shipmentId: string
  /** Amount in minor units (cents), taken from the database — never from the browser. */
  amountMinor: number
  currency: string
  description: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  /** Session already attached to this payment; reused while it is still open. */
  existingSessionId?: string | null
}

export interface CheckoutSession {
  id: string
  url: string
}

export type WebhookEvent =
  | { kind: 'succeeded'; paymentId: string; providerPaymentId: string; amount: number; currency: string }
  | { kind: 'failed'; paymentId: string; providerPaymentId: string }
  | { kind: 'ignored'; reason: string }

export interface PaymentProvider {
  name: string
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>
  /** Verifies the provider signature. Throws WebhookSignatureError when invalid. */
  parseWebhook(request: Request): Promise<WebhookEvent>
}

export class WebhookSignatureError extends Error {}
