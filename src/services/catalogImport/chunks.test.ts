import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ImportChunkResult } from '../../types'
import { isRetriable, sendInChunks } from './chunks'
import type { ImportRow } from './mapping'

const rows: ImportRow[] = Array.from({ length: 1000 }, (_, i) => ({ _row: i + 2, sku: `S${i}` }))
const ok = (n: number): ImportChunkResult => ({ inserted: n, updated: 0, skipped: 0, failed: 0, errors: [], warnings: [] })

test('sends everything once, in order', async () => {
  const seen: number[] = []
  const { progress, cancelled } = await sendInChunks(rows, async (chunk, offset) => {
    seen.push(offset)
    return ok(chunk.length)
  }, { initialSize: 300, backoffMs: 0 })
  assert.equal(cancelled, false)
  assert.equal(progress.inserted, 1000)
  assert.deepEqual(seen, [0, 300, 600, 900])
})

test('statement timeout → smaller chunk, nothing lost or duplicated', async () => {
  const sent = new Set<string>()
  let calls = 0
  const { progress } = await sendInChunks(rows, async (chunk) => {
    calls++
    if (chunk.length > 50) throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
    for (const r of chunk) {
      assert.ok(!sent.has(r.sku!), 'duplicate')
      sent.add(r.sku!)
    }
    return ok(chunk.length)
  }, { initialSize: 200, minSize: 10, backoffMs: 0 })
  assert.equal(sent.size, 1000)
  assert.equal(progress.inserted, 1000)
  assert.ok(progress.retries >= 2 && calls > 20)
})

test('non-retriable errors stop the import; persistent failures give up', async () => {
  await assert.rejects(
    sendInChunks(rows, async () => {
      throw Object.assign(new Error('permission denied'), { code: '42501' })
    }, { backoffMs: 0 }),
    /permission denied/,
  )
  await assert.rejects(
    sendInChunks(rows, async () => {
      throw Object.assign(new Error('Gateway Timeout'), { status: 504 })
    }, { initialSize: 20, minSize: 10, maxRetries: 2, backoffMs: 0 }),
    /Gateway Timeout/,
  )
  assert.equal(isRetriable({ message: 'TypeError: fetch failed' }), true)
  assert.equal(isRetriable({ code: '23505', message: 'duplicate key' }), false)
})

test('cancel stops between chunks', async () => {
  let n = 0
  const { progress, cancelled } = await sendInChunks(rows, async (chunk) => {
    n++
    return ok(chunk.length)
  }, { initialSize: 100, isCancelled: () => n >= 3, backoffMs: 0 })
  assert.equal(cancelled, true)
  assert.equal(progress.sent, 300)
})
