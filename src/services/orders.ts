import { getSupabase } from '../lib/supabase'
import { PRODUCT_COLUMNS } from './catalog/columns'
import type { Order, OrderEvent, OrderItem, PartRequestItem, Product, ShippingAddress } from '../types'

export interface PartRequestInput {
  items: PartRequestItem[]
  message: string
  vehicle: string
  phone: string
  address: ShippingAddress | null
}

/** Customer request/order. Prices are taken from the catalogue by the database. */
export async function createPartRequest(input: PartRequestInput): Promise<{ id: string; order_number: string }> {
  const { data, error } = await getSupabase().rpc('create_part_request', {
    p_items: input.items,
    p_message: input.message.trim() || null,
    p_vehicle: input.vehicle.trim() || null,
    p_contact: { phone: input.phone.trim() },
    p_address: input.address,
  })
  if (error) throw error
  return data as { id: string; order_number: string }
}

/** RLS limits the result to the current user's orders. */
export async function listMyOrders(): Promise<Order[]> {
  const { data, error } = await getSupabase().from('orders').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Order[]
}

export interface OrderBundle {
  order: Order
  items: OrderItem[]
  events: OrderEvent[]
  trackingCode: string | null
}

export async function getMyOrder(id: string): Promise<OrderBundle | null> {
  const supabase = getSupabase()
  const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!order) return null
  const [items, events, shipment] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
    supabase.from('order_events').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    order.shipment_id
      ? supabase.from('shipments').select('tracking_code').eq('id', order.shipment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (items.error) throw items.error
  if (events.error) throw events.error
  return {
    order: order as Order,
    items: items.data as OrderItem[],
    events: events.data as OrderEvent[],
    trackingCode: (shipment.data as { tracking_code: string | null } | null)?.tracking_code ?? null,
  }
}

/** Current public data of the products in the basket (inactive ones are simply missing). */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return []
  const { data, error } = await getSupabase().from('products').select(PRODUCT_COLUMNS).in('id', ids)
  if (error) throw error
  return data as unknown as Product[]
}
