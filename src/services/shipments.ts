import { getSupabase } from '../lib/supabase'
import type { Payment, Shipment, ShipmentEvent, ShipmentInput } from '../types'

export type ShipmentWithPayments = Shipment & { payments: Pick<Payment, 'status' | 'created_at'>[] }

/** Only customer-provided columns are sent; the database sets user_id, status and fees. */
export async function createShipment(input: ShipmentInput): Promise<Shipment> {
  const { data, error } = await getSupabase().from('shipments').insert(input).select().single()
  if (error) throw error
  return data as Shipment
}

/** RLS limits the result to the current user's shipments. */
export async function listMyShipments(userId: string): Promise<ShipmentWithPayments[]> {
  const { data, error } = await getSupabase()
    .from('shipments')
    .select('*, payments(status, created_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ShipmentWithPayments[]
}

export async function getShipment(id: string): Promise<Shipment | null> {
  const { data, error } = await getSupabase().from('shipments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Shipment | null
}

export async function getShipmentEvents(shipmentId: string): Promise<ShipmentEvent[]> {
  const { data, error } = await getSupabase()
    .from('shipment_events')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ShipmentEvent[]
}

export async function getShipmentPayments(shipmentId: string): Promise<Payment[]> {
  const { data, error } = await getSupabase()
    .from('payments')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Payment[]
}

/** Latest payment status for a shipment list row (payments are unordered in the embed). */
export function latestPaymentStatus(shipment: ShipmentWithPayments): Payment['status'] | null {
  if (shipment.payments.length === 0) return null
  return [...shipment.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].status
}

export interface ShipmentBundle {
  shipment: Shipment
  events: ShipmentEvent[]
  payments: Payment[]
}

/** Shipment with its history and payments; null when not found or not visible (RLS). */
export async function getShipmentBundle(id: string): Promise<ShipmentBundle | null> {
  const [shipment, events, payments] = await Promise.all([
    getShipment(id),
    getShipmentEvents(id),
    getShipmentPayments(id),
  ])
  return shipment ? { shipment, events, payments } : null
}
