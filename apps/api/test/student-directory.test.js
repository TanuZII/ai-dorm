import assert from 'node:assert/strict'
import test from 'node:test'

import { createStudentDirectory } from '../src/integrations/studentDirectory.js'

test('student directory uses the configured URL template and bearer token', async () => {
  let request
  const directory = createStudentDirectory({
    STUDENT_SERVICE_LOOKUP_URL: 'https://student.example.test/api/students/{studentId}',
    STUDENT_SERVICE_TOKEN: 'secret-token',
  }, async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify({ studentCode: '690001' }), { status: 200, headers: { 'content-type': 'application/json' } })
  })

  assert.deepEqual(await directory.lookup('69/0001'), { studentCode: '690001' })
  assert.equal(request.url, 'https://student.example.test/api/students/69%2F0001')
  assert.equal(request.options.headers.authorization, 'Bearer secret-token')
})

test('student directory is disabled without a lookup URL', () => {
  assert.equal(createStudentDirectory({}), null)
})
