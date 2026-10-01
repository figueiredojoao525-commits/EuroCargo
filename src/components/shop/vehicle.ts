/** Vehicle filter value (ids as strings; empty = any). */
export interface VehicleValue {
  makeId: string
  modelId: string
  /** Engine / version (vehicle_variants). */
  variantId: string
  year: string
}

export const EMPTY_VEHICLE: VehicleValue = { makeId: '', modelId: '', variantId: '', year: '' }
