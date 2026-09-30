// Payment provider webhook. Deploy with --no-verify-jwt (the provider does not
// send a Supabase JWT); authenticity is established by the provider signature.
//
// Only this function (service role) can confirm a payment, via
// confirm_tracking_payment(), which re-validates amount and currency and then
// generates the tracking code.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, requireEnv } from '../_shared/http.ts'
import { WebhookSignatureError, getPaymentProvider } from '../_shared/payment-provider.ts'

// Database errors that retrying will not fix (logged for manual review).
const PERMANENT_ERRORS = new Set(['payment_not_found', 'payment_not_pending', 'payment_amount_mismatch'])

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const provider = getPaymentProvider()
  if (!provider) return json({ error: 'payment_provider_not_configured' }, 503)

  let event
  try {
    event = await provider.parseWebhook(req)
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn('rejected webhook:', err.message)
      return json({ error: 'invalid_signature' }, 400)
    }
    console.error('webhook parsing failed', err)
    return json({ error: 'invalid_payload' }, 400)
  }

  if (event.kind === 'ignored') return json({ received: true, ignored: event.reason })

  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const { data, error } =
    event.kind === 'succeeded'
      ? await admin.rpc('confirm_tracking_payment', {
          p_payment_id: event.paymentId,
          p_provider: provider.name,
          p_provider_payment_id: event.providerPaymentId,
          p_amount: event.amount,
          p_currency: event.currency,
        })
      : await admin.rpc('mark_payment_failed', {
          p_payment_id: event.paymentId,
          p_provider: provider.name,
          p_provider_payment_id: event.providerPaymentId,
        })

  if (error) {
    const permanent = PERMANENT_ERRORS.has(error.message)
    console.error(`webhook ${event.kind} for payment ${event.paymentId} failed:`, error.message)
    // 5xx → the provider retries later; 422 → needs manual review.
    return json({ error: permanent ? error.message : 'database_error' }, permanent ? 422 : 500)
  }

  return json({ received: true, tracking_code: event.kind === 'succeeded' ? data : undefined })
})
