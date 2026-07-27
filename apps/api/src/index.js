import { createApp } from './app.js'

const port = Number(process.env.API_PORT) || 3000
const app = createApp()
app.listen(port, () => console.log(`Dormitory API listening on http://localhost:${port}`))
