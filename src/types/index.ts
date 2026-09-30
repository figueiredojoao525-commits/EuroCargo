// Values must match the PostgreSQL enums in supabase/migrations.
// Order = the enum order in the database (see 20261001000000_tracking_statuses.sql).
export const SHIPMENT_STATUSES = [
  'created',
  'payment_pending',
  'tracking_ready',
  'payment_confirmed',
  'prepared',
  'pickup_requested',
  'picked_up',
  'departed_facility',
  'in_transit',
  'distribution_center',
  'out_for_delivery',
  'near_delivery',
  'delivered',
  'delivery_issue',
  'returned',
  'cancelled',
] as const

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export type UserRole = 'client' | 'admin'

export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  phone: string | null
  country: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Shipment {
  id: string
  tracking_code: string | null
  user_id: string | null
  sender_name: string
  sender_phone: string
  sender_country: string
  sender_city: string
  sender_address: string
  recipient_name: string
  recipient_phone: string
  recipient_country: string
  recipient_city: string
  recipient_address: string
  package_description: string
  package_weight: number
  notes: string | null
  status: ShipmentStatus
  tracking_fee: number
  tracking_fee_paid: boolean
  /** Tracking code issued by an admin without the online fee. */
  tracking_fee_waived: boolean
  created_at: string
  updated_at: string
}

/** Fields a customer provides when creating a shipment. */
export type ShipmentInput = Pick<
  Shipment,
  | 'sender_name'
  | 'sender_phone'
  | 'sender_country'
  | 'sender_city'
  | 'sender_address'
  | 'recipient_name'
  | 'recipient_phone'
  | 'recipient_country'
  | 'recipient_city'
  | 'recipient_address'
  | 'package_description'
  | 'package_weight'
  | 'notes'
>

export interface ShipmentEvent {
  id: string
  shipment_id: string
  status: ShipmentStatus
  location: string | null
  description: string | null
  /** When it happened (set by the admin); created_at is when it was recorded. */
  occurred_at: string
  created_at: string
  created_by: string | null
}

export interface Payment {
  id: string
  user_id: string | null
  shipment_id: string
  amount: number
  currency: string
  status: PaymentStatus
  provider: string | null
  provider_payment_id: string | null
  created_at: string
  updated_at: string
}

/** Public tracking data returned by the `get_tracking` database function (no personal data). */
export interface TrackingResult {
  tracking_code: string
  status: ShipmentStatus
  /** Short recipient name, e.g. "João F." (never the full name). */
  recipient_display: string | null
  origin_city: string
  origin_country: string
  destination_city: string
  destination_country: string
  created_at: string
  last_update: string
  events: Pick<ShipmentEvent, 'status' | 'location' | 'description' | 'occurred_at' | 'created_at'>[]
}

export * from './catalog'
export * from './orders'
