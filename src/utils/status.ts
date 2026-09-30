import type { ShipmentStatus } from '../types'

// Set only by the payment flow in the database; admins cannot switch to them manually
// (enforced by admin_add_shipment_event()).
export const SYSTEM_STATUSES: ShipmentStatus[] = ['created', 'payment_pending', 'tracking_ready']
