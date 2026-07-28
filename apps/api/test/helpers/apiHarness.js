import { createApp as defaultCreateApp } from '../../src/app.js'
import { createDb as defaultCreateDb } from '../../src/db.js'
import { assertSafeIntegrationConfig, readIntegrationConfig } from '../../src/integrations/config.js'

function closeServer(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

export async function startApiHarness({ env = { NODE_ENV: 'test' }, integrations, factories = {} } = {}) {
  const integrationConfig = readIntegrationConfig(env)
  assertSafeIntegrationConfig(integrationConfig, env)

  const createDb = factories.createDb || defaultCreateDb
  const createApp = factories.createApp || defaultCreateApp
  const db = createDb(':memory:')
  let server
  try {
    const app = createApp({ db, integrations, integrationConfig })
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve, reject) => {
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      const onError = error => {
        server.off('listening', onListening)
        reject(error)
      }
      server.once('listening', onListening)
      server.once('error', onError)
    })
  } catch (error) {
    if (server) {
      try { await closeServer(server) } catch {}
    }
    db.close()
    throw error
  }

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

  let serverClosed = false
  let databaseClosed = false
  let closing
  async function close() {
    if (serverClosed && databaseClosed) return
    if (closing) return closing
    closing = (async () => {
      if (!serverClosed) {
        await closeServer(server)
        serverClosed = true
      }
      if (!databaseClosed) {
        db.close()
        databaseClosed = true
      }
    })()
    try {
      await closing
    } finally {
      closing = undefined
    }
  }

  return { db, base, api, login, close }
}
