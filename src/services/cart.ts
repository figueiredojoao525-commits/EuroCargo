// Parts request basket, kept per browser (localStorage). It only stores product
// ids and quantities: prices are always re-read from the database, and the order
// itself is priced server-side by create_part_request().
import { useSyncExternalStore } from 'react'

export interface CartLine {
  productId: string
  quantity: number
}

const STORAGE_KEY = 'eurocargo_cart'
const MAX_LINES = 20
const listeners = new Set<() => void>()
let lines: CartLine[] = read()

function read(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((l): l is CartLine => typeof l?.productId === 'string' && Number.isInteger(l?.quantity))
      .slice(0, MAX_LINES)
  } catch {
    return []
  }
}

function write(next: CartLine[]) {
  lines = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: the basket still works for this page view.
  }
  listeners.forEach((listener) => listener())
}

export const cart = {
  add(productId: string, quantity = 1) {
    const existing = lines.find((l) => l.productId === productId)
    if (existing) {
      write(lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(l.quantity + quantity, 99) } : l)))
    } else if (lines.length < MAX_LINES) {
      write([...lines, { productId, quantity: Math.min(Math.max(quantity, 1), 99) }])
    }
  },
  setQuantity(productId: string, quantity: number) {
    write(lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(Math.max(quantity, 1), 99) } : l)))
  },
  remove(productId: string) {
    write(lines.filter((l) => l.productId !== productId))
  },
  clear() {
    write([])
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      lines = read()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(
    subscribe,
    () => lines,
    () => lines,
  )
}
