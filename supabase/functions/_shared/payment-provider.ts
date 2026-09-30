// Provider-agnostic payment interface. Add a new provider by implementing
// PaymentProvider and returning it from getPaymentProvider().
import { createStripeProvider } from './stripe.ts'
import type { PaymentProvider } from './payment-types.ts'

export { WebhookSignatureError } from './payment-types.ts'

/** Returns null when no provider is configured (no secrets set). */
export function getPaymentProvider(): PaymentProvider | null {
  const provider = Deno.env.get('PAYMENT_PROVIDER') ?? 'stripe'

  if (provider === 'stripe') {
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!secretKey || !webhookSecret) return null
    return createStripeProvider(secretKey, webhookSecret)
  }

  return null
}
