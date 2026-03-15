import type { FastifyInstance } from "fastify"
import { ChangelogService } from "@/services/changelog.service.js"

const service = new ChangelogService()

export async function changelogRoutes(app: FastifyInstance) {
    app.get("/changelogs", async (_req, reply) => {
        try {
            const updates = await service.getFullTree()
            return reply.view("updates.ejs", { updates })
        } catch (err) {
            reply.status(500).send({ error: (err as Error).message })
        }
    })

    app.get<{ Params: { slug: string } }>("/game-updates/:slug/changelogs", async (req, reply) => {
        try {
            const changelogs = await service.getChangelogs(req.params.slug)
            if (!changelogs.length) {
                return reply.status(404).send({ error: "No changelogs found" })
            }
            return reply.send({ data: changelogs })
        } catch (err) {
            reply.status(500).send({ error: (err as Error).message })
        }
    })

    app.get<{ Params: { slug: string } }>("/changelogs/:slug", async (req, reply) => {
        try {
            const content = await service.getChangelogContent(req.params.slug)
            return reply.view("changelog.ejs", { content })
        } catch (err) {
            reply.status(500).send({ error: (err as Error).message })
        }
    })

    app.get<{ Querystring: { q: string } }>("/search", async (req, reply) => {
        try {
            const { q } = req.query
            if (!q?.trim()) return reply.view("search.ejs", { query: "", results: [] })

            const results = await service.search(q)
            return reply.view("search.ejs", { query: q, results })
        } catch (err) {
            reply.status(500).send({ error: (err as Error).message })
        }
    })
    // tira na prod
    app.get("/scrape/changelogs", async (_req, reply) => {
        try {
            const updates = await service.getFullTree()

            return reply.send({
                updates: updates.length,
                changelogs: updates.reduce((acc, u) => acc + u.changelogs.length, 0)
            })
        } catch (err) {
            return reply.status(500).send({
                error: (err as Error).message
            })
        }
    })
}
