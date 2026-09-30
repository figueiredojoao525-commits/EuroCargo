/** Vehicle filter value (ids as strings; empty = any). */
export interface VehicleValue {
  makeId: string
  modelId: string
  year: string
}

export const EMPTY_VEHICLE: VehicleValue = { makeId: '', modelId: '', year: '' }
