import { createApp } from '../../src/app.js'
import { createDb } from '../../src/db.js'
import { assertSafeIntegrationConfig, readIntegrationConfig } from '../../src/integrations/config.js'

export async function startApiHarness({ env = { NODE_ENV: 'test' }, integrations } = {}) {
  const integrationConfig = readIntegrationConfig(env)
  assertSafeIntegrationConfig(integrationConfig, env)

  const db = createDb(':memory:')
  const server = createApp({ db, integrations, integrationConfig }).listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const base = `http://127.0.0.1:${server.address().port}/api`
  let token = ''

  async function api(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    })
    const body = response.status === 204 ? null : await response.json()
    return { response, body }
  }

  async function login({ username = 'admin', password = 'Admin@1234' } = {}) {
    const result = await api('/auth/login', { method: 'POST', body: { username, password } })
    if (result.response.ok) token = result.body.token
    return result
  }

  let closed = false
  async function close() {
    if (closed) return
    closed = true
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }

  return { db, base, api, login, close }
}
