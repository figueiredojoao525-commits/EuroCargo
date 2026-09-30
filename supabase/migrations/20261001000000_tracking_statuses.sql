-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — additional shipment statuses
--
-- Kept in its own migration: PostgreSQL only allows a new enum value to be
-- used once the transaction that added it has committed.
-- Existing values are kept (they are referenced by data and functions).
-- ════════════════════════════════════════════════════════════════════

alter type public.shipment_status add value if not exists 'payment_confirmed' after 'tracking_ready';
alter type public.shipment_status add value if not exists 'prepared' after 'payment_confirmed';
alter type public.shipment_status add value if not exists 'departed_facility' after 'picked_up';
alter type public.shipment_status add value if not exists 'near_delivery' after 'out_for_delivery';
alter type public.shipment_status add value if not exists 'delivery_issue' after 'delivered';
alter type public.shipment_status add value if not exists 'returned' after 'delivery_issue';
