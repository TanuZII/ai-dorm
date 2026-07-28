export function readIntegrationConfig(env = process.env) {
  const simulationEnabled = env.INTEGRATION_SIMULATION === 'true'
  return {
    simulationEnabled,
    mode: simulationEnabled ? 'simulated' : 'real',
    callbackSecret: env.PAYMENT_CALLBACK_SECRET || null,
    directoryPassword: env.SIM_DIRECTORY_PASSWORD || null,
  }
}

export function assertSafeIntegrationConfig(config, env = process.env) {
  if (env.NODE_ENV === 'production' && config.simulationEnabled) {
    const error = new Error('Integration simulation cannot run in production')
    error.code = 'SIMULATION_FORBIDDEN_IN_PRODUCTION'
    throw error
  }
  if (config.simulationEnabled && (!config.callbackSecret || !config.directoryPassword)) {
    const error = new Error('Simulation secrets are required')
    error.code = 'SIMULATION_CONFIG_INCOMPLETE'
    throw error
  }
}
