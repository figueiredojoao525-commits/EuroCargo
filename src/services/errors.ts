import type { Dictionary } from '../i18n'
import { NotConfiguredError } from '../lib/supabase'

/**
 * Maps Supabase Auth error codes and the exception names raised by our database
 * functions (see supabase/migrations) to translated, user-facing messages.
 */
export function getErrorMessage(error: unknown, t: Dictionary): string {
  if (error instanceof NotConfiguredError) return t.common.notConfigured
  if (error instanceof Error && error.message === 'ai_not_configured') return t.assistant.notConfigured

  const { code, message } = (error ?? {}) as { code?: string; message?: string }

  switch (code) {
    case 'invalid_credentials':
      return t.auth.invalidCredentials
    case 'email_not_confirmed':
      return t.auth.emailNotConfirmed
    case 'user_already_exists':
    case 'email_exists':
      return t.auth.userExists
    case 'weak_password':
      return t.auth.weakPassword
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return t.auth.rateLimited
  }

  // Malformed UUID in a URL behaves like a missing record.
  if (code === '22P02') return t.shipment.notFound
  // Unique / foreign-key / check violations from admin forms.
  if (code === '23505') return t.errors.duplicate
  if (code === '23503') return t.errors.inUse
  if (code === '23514') return t.errors.invalidData

  switch (message) {
    case 'tracking_already_paid':
      return t.shipment.alreadyPaid
    case 'shipment_cancelled':
      return t.shipment.cancelledShipment
    case 'shipment_not_found':
      return t.shipment.notFound
    case 'forbidden':
      return t.admin.accessDenied
    case 'status_managed_by_system':
      return t.admin.update.systemStatus
    case 'empty_update':
      return t.admin.update.empty
    case 'payment_provider_not_configured':
      return t.shipment.paymentUnavailable
    case 'product_not_found':
      return t.errors.productNotFound
    case 'empty_request':
    case 'invalid_items':
      return t.cart.emptyRequest
    case 'no_supplier_cost':
      return t.adminPricing.noSupplierCost
    case 'no_price_rule':
      return t.adminPricing.noRule
    case 'invalid_event_date':
      return t.admin.update.invalidDate
    case 'order_not_available':
      return t.adminOrders.alreadyShipped
    case 'customer_not_found':
      return t.errors.customerNotFound
    case 'order_number_immutable':
      return t.errors.invalidData
  }

  return t.common.genericError
}
