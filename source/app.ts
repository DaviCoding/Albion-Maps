import Fastify from "fastify"
import cors from "@fastify/cors"
import fastifyView from "@fastify/view"
import ejs from "ejs"
import { changelogRoutes } from "@/routes/changelog.routes.js"
import { ChangelogService } from "@/services/changelog.service.js"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { EventEmitter } from "node:events"
import cron from "node-cron"
import { legalRoutes } from "./routes/legal.router.js"

const emitter = new EventEmitter()
const service = new ChangelogService()

emitter.on("daily-update", async () => {
    console.log("[daily-update] Checking for new changelogs...")
    const synced = await service.syncIfUpdated()
    console.log(`[daily-update] ${synced ? "New content found and synced" : "Already up to date"}`)
})

cron.schedule("0 9 * * *", () => {
    emitter.emit("daily-update")
})

export async function buildApp() {
    const app = Fastify()

    await app.register(cors, { origin: true })

    const __dirname = dirname(fileURLToPath(import.meta.url))

    await app.register(fastifyView, {
        engine: { ejs },
        root: join(__dirname, "views"),
        layout: "layouts/main.ejs"
    })

    app.get("/health", async () => ({ status: "ok" }))

    await app.register(changelogRoutes)
    await app.register(legalRoutes)

    return app
}