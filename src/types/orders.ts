// Customer, order and order-item types (see 20261001000100_parts_catalog_orders.sql).
import type { PartCondition } from './catalog'

export const ORDER_STATUSES = [
  'draft',
  'submitted',
  'quoted',
  'confirmed',
  'awaiting_payment',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_CHANNELS = ['website', 'whatsapp', 'phone', 'in_person', 'email', 'other'] as const
export type OrderChannel = (typeof ORDER_CHANNELS)[number]

export interface Customer {
  id: string
  user_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  country: string | null
  tax_id: string | null
  source: OrderChannel
  created_at: string
  updated_at: string
}

export interface CustomerAddress {
  id: string
  customer_id: string
  label: string | null
  recipient_name: string
  phone: string | null
  line1: string
  line2: string | null
  postal_code: string | null
  city: string
  region: string | null
  country: string
  is_default: boolean
}

/** Snapshot stored on the order (keys filtered by clean_address()). */
export interface ShippingAddress {
  name?: string
  phone?: string
  line1?: string
  line2?: string
  postal_code?: string
  city?: string
  country?: string
}

export interface Order {
  id: string
  order_number: string
  customer_id: string
  user_id: string | null
  channel: OrderChannel
  status: OrderStatus
  currency: string
  subtotal: number
  shipping_amount: number
  total: number
  customer_message: string | null
  vehicle_info: string | null
  shipping_address: ShippingAddress | null
  shipment_id: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  description: string
  part_number: string | null
  condition: PartCondition | null
  quantity: number
  /** null = still to be quoted. */
  unit_price: number | null
  line_total: number
  created_at: string
}

export interface OrderEvent {
  id: string
  order_id: string
  status: OrderStatus
  note: string | null
  visible_to_customer: boolean
  created_at: string
}

export interface OrderNote {
  id: string
  order_id: string
  body: string
  created_at: string
}

/** Item sent to create_part_request(): a catalogue product or a free-text request. */
export type PartRequestItem = { product_id: string; quantity: number } | { description: string; quantity: number }
