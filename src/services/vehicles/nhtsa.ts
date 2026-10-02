import type { Fuel } from '../../types'

/**
 * VIN decoding with NHTSA vPIC (US government open data, free, no key, CORS enabled):
 * https://vpic.nhtsa.dot.gov/api/ — vehicles only, never parts.
 *
 * Coverage: complete for vehicles built for the US market. For European (and most Angolan, i.e. imported
 * European / Asian) vehicles it usually identifies only the manufacturer from the WMI (first 3 characters):
 * model and model year are not reliable there (EU VINs need not encode the year), so they are used ONLY
 * when NHTSA reports a clean decode (ErrorCode "0").
 */
export interface VinDecode {
  make: string | null
  model: string | null
  year: number | null
  fuel: Fuel | null
  engineCc: number | null
  /** NHTSA decoded the VIN without errors (typically US-market vehicles). */
  complete: boolean
}

const API = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues'
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i

const FUELS: [RegExp, Fuel][] = [
  [/diesel/i, 'diesel'],
  [/electric/i, 'electric'],
  [/gasoline|petrol/i, 'petrol'],
  [/lpg|liquefied petroleum|propane/i, 'lpg'],
]

/** One "Results" row of DecodeVinValues → what EuroCargo can use. Pure (unit-tested). */
export function parseVinResult(row: Record<string, string | null | undefined>): VinDecode {
  const value = (key: string) => (row[key] ?? '').trim() || null
  const codes = (value('ErrorCode') ?? '').split(',').map((c) => c.trim()).filter(Boolean)
  const complete = codes.length > 0 && codes.every((c) => c === '0')
  const make = value('Make')
  const yearNumber = Number(value('ModelYear'))
  const litres = Number(value('DisplacementL'))
  const fuelText = value('FuelTypePrimary') ?? ''
  return {
    make: make ? make.toUpperCase() : null,
    model: complete ? value('Model') : null,
    year: complete && yearNumber >= 1950 && yearNumber <= new Date().getFullYear() + 1 ? yearNumber : null,
    fuel: complete ? (FUELS.find(([re]) => re.test(fuelText))?.[1] ?? null) : null,
    engineCc: complete && litres > 0 ? Math.round(litres * 1000) : null,
    complete,
  }
}

const cache = new Map<string, VinDecode | null>()

/** Null when the service is unreachable or the VIN identifies nothing. Never throws. */
export async function decodeVin(vin: string): Promise<VinDecode | null> {
  const key = vin.trim().toUpperCase()
  if (!VIN_PATTERN.test(key)) return null
  if (cache.has(key)) return cache.get(key)!
  try {
    const res = await fetch(`${API}/${encodeURIComponent(key)}?format=json`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as { Results?: Record<string, string>[] }
    const row = data.Results?.[0]
    const decoded = row ? parseVinResult(row) : null
    const result = decoded?.make ? decoded : null
    cache.set(key, result)
    return result
  } catch {
    return null // offline / timeout: the customer simply chooses the vehicle by hand
  }
}

function plain(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Same name ignoring case, accents and punctuation ("MERCEDES-BENZ" = "Mercedes-Benz"). */
export function sameName(a: string, b: string): boolean {
  return plain(a) === plain(b)
}
