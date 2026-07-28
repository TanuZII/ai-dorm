import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readIntegrationConfig, assertSafeIntegrationConfig } from '../src/integrations/config.js'
import { startApiHarness } from './helpers/apiHarness.js'

test('rejects integration simulation in production', () => {
  const env = { NODE_ENV: 'production', INTEGRATION_SIMULATION: 'true' }
  const config = readIntegrationConfig(env)

  assert.throws(() => assertSafeIntegrationConfig(config, env), {
    code: 'SIMULATION_FORBIDDEN_IN_PRODUCTION',
  })
})

test('enables simulation only for the exact true value', () => {
  const enabled = readIntegrationConfig({
    NODE_ENV: 'test',
    INTEGRATION_SIMULATION: 'true',
    PAYMENT_CALLBACK_SECRET: 'test-callback-secret',
    SIM_DIRECTORY_PASSWORD: 'Directory@123',
  })

  assert.deepEqual(enabled, {
    simulationEnabled: true,
    mode: 'simulated',
    callbackSecret: 'test-callback-secret',
    directoryPassword: 'Directory@123',
  })
  assert.equal(readIntegrationConfig({ NODE_ENV: 'test', INTEGRATION_SIMULATION: 'TRUE' }).simulationEnabled, false)
  assert.equal(readIntegrationConfig({ NODE_ENV: 'test', INTEGRATION_SIMULATION: 'false' }).simulationEnabled, false)
})

test('requires simulation-only secrets when simulation is enabled', () => {
  const config = readIntegrationConfig({ NODE_ENV: 'test', INTEGRATION_SIMULATION: 'true' })

  assert.throws(() => assertSafeIntegrationConfig(config, { NODE_ENV: 'test' }), {
    code: 'SIMULATION_CONFIG_INCOMPLETE',
  })
})

test('starts an isolated API harness with login and deterministic cleanup', async () => {
  const harness = await startApiHarness()

  try {
    const login = await harness.login()
    assert.equal(login.response.status, 200)

    const me = await harness.api('/auth/me')
    assert.equal(me.response.status, 200)
    assert.equal(me.body.username, 'admin')
  } finally {
    await harness.close()
  }

  assert.throws(() => harness.db.prepare('SELECT 1'), /not open/)
})

test('closes the database when API creation fails during harness startup', async () => {
  const startupError = new Error('create app failed')
  let databaseCloseCount = 0
  const db = { close: () => { databaseCloseCount += 1 } }

  const result = await startApiHarness({
    factories: {
      createDb: () => db,
      createApp: () => { throw startupError },
    },
  }).then(harness => ({ harness }), error => ({ error }))
  await result.harness?.close()

  assert.equal(result.error, startupError)
  assert.equal(databaseCloseCount, 1)
})

test('closes the server and database when its listener fails to start', async () => {
  const startupError = new Error('listen failed')
  let serverCloseCount = 0
  let databaseCloseCount = 0
  const db = { close: () => { databaseCloseCount += 1 } }
  const server = new EventEmitter()
  server.listen = () => {
    queueMicrotask(() => server.emit('error', startupError))
    return server
  }
  server.close = callback => {
    serverCloseCount += 1
    callback()
  }

  const result = await startApiHarness({
    factories: {
      createDb: () => db,
      createApp: () => server,
    },
  }).then(harness => ({ harness }), error => ({ error }))
  await result.harness?.close()

  assert.equal(result.error, startupError)
  assert.equal(serverCloseCount, 1)
  assert.equal(databaseCloseCount, 1)
})

test('retries cleanup after server close fails without leaking the database', async () => {
  const closeError = new Error('close failed')
  let serverCloseCount = 0
  let databaseCloseCount = 0
  const db = { close: () => { databaseCloseCount += 1 } }
  const server = new EventEmitter()
  server.listen = () => {
    queueMicrotask(() => server.emit('listening'))
    return server
  }
  server.address = () => ({ port: 12345 })
  server.close = callback => {
    serverCloseCount += 1
    callback(serverCloseCount === 1 ? closeError : undefined)
  }

  const harness = await startApiHarness({
    factories: {
      createDb: () => db,
      createApp: () => server,
    },
  })

  await assert.rejects(() => harness.close(), closeError)
  assert.equal(databaseCloseCount, 0)
  await harness.close()

  assert.equal(serverCloseCount, 2)
  assert.equal(databaseCloseCount, 1)
})
