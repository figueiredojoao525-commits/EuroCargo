// Admin customers, orders and manual shipments. Authorised in the database.
import { getSupabase } from '../lib/supabase'
import type {
  Customer,
  CustomerAddress,
  Order,
  OrderEvent,
  OrderItem,
  OrderNote,
  OrderStatus,
  ShipmentInput,
} from '../types'
import { ADMIN_LIST_SIZE } from './adminCatalog'

type Row = Record<string, unknown>

// ── Customers ──
export async function listCustomers(text: string, page: number): Promise<{ rows: Customer[]; total: number }> {
  let query = getSupabase()
    .from('customers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * ADMIN_LIST_SIZE, (page + 1) * ADMIN_LIST_SIZE - 1)
  const clean = text.trim().replace(/[%_,()]/g, ' ')
  if (clean) query = query.or(`full_name.ilike.%${clean}%,email.ilike.%${clean}%,phone.ilike.%${clean}%`)
  const { data, error, count } = await query
  if (error) throw error
  return { rows: data as Customer[], total: count ?? 0 }
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const { data, error } = await getSupabase().from('customers').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Customer | null
}

export async function saveCustomer(row: Row, id?: string): Promise<Customer> {
  const query = id
    ? getSupabase().from('customers').update(row).eq('id', id).select().single()
    : getSupabase().from('customers').insert(row).select().single()
  const { data, error } = await query
  if (error) throw error
  return data as Customer
}

export async function listCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await getSupabase()
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
  if (error) throw error
  return data as CustomerAddress[]
}

export async function saveCustomerAddress(row: Row, id?: string): Promise<CustomerAddress> {
  const query = id
    ? getSupabase().from('customer_addresses').update(row).eq('id', id).select().single()
    : getSupabase().from('customer_addresses').insert(row).select().single()
  const { data, error } = await query
  if (error) throw error
  return data as CustomerAddress
}

// ── Orders ──
export type OrderWithCustomer = Order & { customer: Pick<Customer, 'id' | 'full_name' | 'phone' | 'email'> | null }

export interface OrderFilters {
  text: string
  status: OrderStatus | ''
}

export async function listOrders(
  filters: OrderFilters,
  page: number,
): Promise<{ rows: OrderWithCustomer[]; total: number }> {
  let query = getSupabase()
    .from('orders')
    .select('*, customer:customers(id, full_name, phone, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * ADMIN_LIST_SIZE, (page + 1) * ADMIN_LIST_SIZE - 1)
  const code = filters.text.toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (code) query = query.ilike('order_number', `%${code}%`)
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error, count } = await query
  if (error) throw error
  return { rows: data as OrderWithCustomer[], total: count ?? 0 }
}

export interface AdminOrderBundle {
  order: OrderWithCustomer
  items: OrderItem[]
  events: OrderEvent[]
  notes: OrderNote[]
  shipment: { id: string; tracking_code: string | null; status: string } | null
}

export async function getOrderForAdmin(id: string): Promise<AdminOrderBundle | null> {
  const supabase = getSupabase()
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, customer:customers(id, full_name, phone, email)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!order) return null
  const [items, events, notes, shipment] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
    supabase.from('order_events').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    supabase.from('order_notes').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    order.shipment_id
      ? supabase.from('shipments').select('id, tracking_code, status').eq('id', order.shipment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  for (const r of [items, events, notes, shipment]) if (r.error) throw r.error
  return {
    order: order as OrderWithCustomer,
    items: items.data as OrderItem[],
    events: events.data as OrderEvent[],
    notes: notes.data as OrderNote[],
    shipment: shipment.data as AdminOrderBundle['shipment'],
  }
}

export async function saveOrder(row: Row, id?: string): Promise<Order> {
  const query = id
    ? getSupabase().from('orders').update(row).eq('id', id).select().single()
    : getSupabase().from('orders').insert(row).select().single()
  const { data, error } = await query
  if (error) throw error
  return data as Order
}

export async function saveOrderItem(row: Row, id?: string): Promise<void> {
  const query = id
    ? getSupabase().from('order_items').update(row).eq('id', id)
    : getSupabase().from('order_items').insert(row)
  const { error } = await query
  if (error) throw error
}

export async function deleteOrderItem(id: string): Promise<void> {
  const { error } = await getSupabase().from('order_items').delete().eq('id', id)
  if (error) throw error
}

/** Message visible to the customer in their order history. */
export async function addOrderEvent(orderId: string, status: OrderStatus, note: string): Promise<void> {
  const { error } = await getSupabase()
    .from('order_events')
    .insert({ order_id: orderId, status, note, visible_to_customer: true })
  if (error) throw error
}

export async function addOrderNote(orderId: string, body: string): Promise<void> {
  const { error } = await getSupabase().from('order_notes').insert({ order_id: orderId, body })
  if (error) throw error
}

// ── Manual shipments & tracking ──
export async function createShipmentAsAdmin(
  input: ShipmentInput,
  customerId: string | null,
  orderId: string | null,
  generateCode: boolean,
): Promise<{ id: string; tracking_code: string | null }> {
  const { data, error } = await getSupabase().rpc('admin_create_shipment', {
    p_shipment: input,
    p_customer_id: customerId,
    p_order_id: orderId,
    p_generate_code: generateCode,
  })
  if (error) throw error
  return data as { id: string; tracking_code: string | null }
}

export async function generateTrackingCode(shipmentId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('admin_generate_tracking_code', { p_shipment_id: shipmentId })
  if (error) throw error
  return data as string
}
