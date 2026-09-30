import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

/**
 * Starts the €1 tracking-code payment:
 *   1. `request_tracking_code` (database) creates/reuses a pending payment whose
 *      amount is defined server-side;
 *   2. the `create-checkout` Edge Function opens a checkout session with the
 *      payment provider and returns its URL.
 * The payment is only confirmed later by the provider's signed webhook — never
 * by the browser.
 *
 * Throws Error('payment_provider_not_configured') when the Edge Function is not
 * deployed or no provider is configured yet.
 */
export async function startTrackingPayment(shipmentId: string): Promise<string> {
  const supabase = getSupabase()

  const { data: paymentId, error } = await supabase.rpc('request_tracking_code', { p_shipment_id: shipmentId })
  if (error) throw error

  const { data, error: fnError } = await supabase.functions.invoke<{ url?: string }>('create-checkout', {
    body: { payment_id: paymentId },
  })

  if (fnError) {
    // Network/relay errors or a 404 without our JSON body mean the function is not deployed.
    let code = 'payment_provider_not_configured'
    if (fnError instanceof FunctionsHttpError) {
      const status = fnError.context.status
      const body = (await fnError.context.json().catch(() => null)) as { error?: string } | null
      code = body?.error ?? (status === 404 ? 'payment_provider_not_configured' : 'payment_error')
    }
    throw new Error(code)
  }

  const url = data?.url
  if (!url || new URL(url).protocol !== 'https:') throw new Error('payment_error')
  return url
}
