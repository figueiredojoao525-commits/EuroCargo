// Format: EC-<country>-<year>-<6 chars>, e.g. EC-PT-2026-8F42K9 (must match the database constraint).
export const TRACKING_CODE_PATTERN = /^EC-[A-Z]{2}-\d{4}-[A-Z0-9]{6}$/

export function normalizeTrackingCode(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidTrackingCode(value: string): boolean {
  return TRACKING_CODE_PATTERN.test(normalizeTrackingCode(value))
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isValidPhone(value: string): boolean {
  return /^\+?[\d\s()-]{6,30}$/.test(value.trim())
}

export const MIN_PASSWORD_LENGTH = 8
