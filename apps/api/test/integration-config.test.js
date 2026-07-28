import test from 'node:test'
import assert from 'node:assert/strict'
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
