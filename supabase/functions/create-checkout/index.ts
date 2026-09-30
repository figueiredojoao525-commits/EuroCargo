// POST { payment_id } — authenticated customer.
// Opens a checkout session for a pending tracking-fee payment owned by the caller.
// The amount comes from the `payments` row (set by request_tracking_code()), never from the request.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, requireEnv } from '../_shared/http.ts'
import { getPaymentProvider } from '../_shared/payment-provider.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = requireEnv('SUPABASE_URL')

  // Identify the caller from their JWT.
  const userClient = createClient(supabaseUrl, requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return json({ error: 'not_authenticated' }, 401)

  let paymentId: unknown
  try {
    paymentId = (await req.json())?.payment_id
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  if (typeof paymentId !== 'string' || !UUID_PATTERN.test(paymentId)) {
    return json({ error: 'invalid_payment_id' }, 400)
  }

  const provider = getPaymentProvider()
  const siteUrl = Deno.env.get('SITE_URL')
  if (!provider || !siteUrl) return json({ error: 'payment_provider_not_configured' }, 503)

  // Service-role client: bypasses RLS, so ownership is checked explicitly below.
  const admin = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const { data: payment, error } = await admin
    .from('payments')
    .select('id, user_id, shipment_id, amount, currency, status, provider, provider_payment_id')
    .eq('id', paymentId)
    .maybeSingle()

  if (error) {
    console.error('payments lookup failed', error)
    return json({ error: 'database_error' }, 500)
  }
  if (!payment || payment.user_id !== user.id) return json({ error: 'payment_not_found' }, 404)
  if (payment.status !== 'pending') return json({ error: 'payment_not_pending' }, 409)

  const returnUrl = (status: string) =>
    `${siteUrl.replace(/\/$/, '')}/payment/return?status=${status}&shipment=${payment.shipment_id}`

  try {
    const session = await provider.createCheckout({
      paymentId: payment.id,
      shipmentId: payment.shipment_id,
      amountMinor: Math.round(Number(payment.amount) * 100),
      currency: payment.currency,
      description: 'EuroCargo — código de rastreio / código de seguimiento',
      successUrl: returnUrl('success'),
      cancelUrl: returnUrl('cancelled'),
      customerEmail: user.email,
      existingSessionId: payment.provider === provider.name ? payment.provider_payment_id : null,
    })

    const { error: updateError } = await admin
      .from('payments')
      .update({ provider: provider.name, provider_payment_id: session.id })
      .eq('id', payment.id)
      .eq('status', 'pending')
    if (updateError) throw updateError

    return json({ url: session.url })
  } catch (err) {
    console.error('checkout creation failed', err)
    return json({ error: 'payment_provider_error' }, 502)
  }
})
