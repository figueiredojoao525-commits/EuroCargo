import { getSupabase } from '../lib/supabase'
import type { TrackingResult } from '../types'
import { normalizeTrackingCode } from '../utils/validation'

/**
 * Public lookup through the `get_tracking` database function, which exposes
 * only non-personal data. Returns null when the code does not exist.
 */
export async function trackByCode(code: string): Promise<TrackingResult | null> {
  const { data, error } = await getSupabase().rpc('get_tracking', { p_code: normalizeTrackingCode(code) })
  if (error) throw error
  return (data as TrackingResult | null) ?? null
}
