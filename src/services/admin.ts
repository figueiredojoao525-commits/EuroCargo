// Admin data access. Every call is authorised in the database (RLS policies and
// is_admin() checks inside functions); a non-admin gets empty results or 'forbidden'.
import { getSupabase } from '../lib/supabase'
import type { Payment, PaymentStatus, Shipment, ShipmentStatus } from '../types'

export const ADMIN_PAGE_SIZE = 25

export interface AdminStats {
  total: number
  pending: number
  in_transit: number
  delivered: number
  payments_paid: number
  orders_open: number
  orders_new: number
  products_active: number
  customers: number
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data, error } = await getSupabase().rpc('admin_dashboard_stats')
  if (error) throw error
  return data as AdminStats
}

export interface ShipmentFilters {
  code: string
  status: ShipmentStatus | ''
  origin: string
  destination: string
  dateFrom: string // YYYY-MM-DD (local)
  dateTo: string // YYYY-MM-DD (local), inclusive
}

export const EMPTY_FILTERS: ShipmentFilters = {
  code: '',
  status: '',
  origin: '',
  destination: '',
  dateFrom: '',
  dateTo: '',
}

function startOfLocalDay(date: string, addDays = 0): string {
  const day = new Date(`${date}T00:00:00`)
  day.setDate(day.getDate() + addDays)
  return day.toISOString()
}

export async function listShipments(
  filters: ShipmentFilters,
  page: number,
): Promise<{ rows: Shipment[]; total: number }> {
  let query = getSupabase()
    .from('shipments')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE - 1)

  // Tracking codes only contain A-Z, 0-9 and '-', so anything else is dropped.
  const code = filters.code.toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (code) query = query.ilike('tracking_code', `%${code}%`)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.origin) query = query.eq('sender_country', filters.origin)
  if (filters.destination) query = query.eq('recipient_country', filters.destination)
  if (filters.dateFrom) query = query.gte('created_at', startOfLocalDay(filters.dateFrom))
  if (filters.dateTo) query = query.lt('created_at', startOfLocalDay(filters.dateTo, 1))

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data as Shipment[], total: count ?? 0 }
}

/**
 * Adds a history event and (optionally) changes the status, atomically and audited.
 * `occurredAt` (ISO) is when it happened; defaults to now in the database.
 */
export async function addShipmentEvent(
  shipmentId: string,
  status: ShipmentStatus,
  location: string,
  description: string,
  occurredAt?: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('admin_add_shipment_event', {
    p_shipment_id: shipmentId,
    p_status: status,
    p_location: location,
    p_description: description,
    p_occurred_at: occurredAt ?? null,
  })
  if (error) throw error
}

export type PaymentWithShipment = Payment & { shipments: Pick<Shipment, 'id' | 'tracking_code'> | null }

export async function listPayments(
  status: PaymentStatus | '',
  page: number,
): Promise<{ rows: PaymentWithShipment[]; total: number }> {
  let query = getSupabase()
    .from('payments')
    .select('*, shipments(id, tracking_code)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE - 1)
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data as PaymentWithShipment[], total: count ?? 0 }
}
