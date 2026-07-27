import test from 'node:test'
import assert from 'node:assert/strict'
import { parseApiResponse } from '../src/services/api.js'

test('reports an outdated backend instead of a JSON syntax error', async () => {
  const response = new Response('<!doctype html><title>Not Found</title>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })
  await assert.rejects(() => parseApiResponse(response, '/beds'), error => {
    assert.match(error.message, /Backend รุ่นเก่า/)
    assert.doesNotMatch(error.message, /Unexpected token/)
    return true
  })
})

test('keeps JSON error messages', async () => {
  const response = new Response(JSON.stringify({ message: 'ไม่มีสิทธิ์ดูข้อมูล' }), { status: 403, headers: { 'content-type': 'application/json' } })
  await assert.rejects(() => parseApiResponse(response, '/contracts'), { message: 'ไม่มีสิทธิ์ดูข้อมูล' })
})

test('returns successful JSON', async () => {
  const response = new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { 'content-type': 'application/json' } })
  assert.deepEqual(await parseApiResponse(response, '/rooms'), [{ id: 1 }])
})
