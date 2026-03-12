import "dotenv/config"
import { buildApp } from "./app.js"

async function start() {
    const app = await buildApp()

    const port = Number(process.env.PORT) || 1000
    const host = process.env.HOST || "0.0.0.0"

    try {
        app.listen({ port, host }, () => {
            console.log(`running: http://localhost:${port}`)
        })
    } catch (err) {
        app.log.error(err)
        process.exit(1)
    }
}

start()