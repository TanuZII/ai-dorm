import { createApp } from './app.js'
import { assertSafeIntegrationConfig, readIntegrationConfig } from './integrations/config.js'

const port = Number(process.env.API_PORT) || 3000
const integrationConfig = readIntegrationConfig()
assertSafeIntegrationConfig(integrationConfig)
const app = createApp({ integrationConfig })
app.listen(port, () => console.log(`Dormitory API listening on http://localhost:${port}`))
