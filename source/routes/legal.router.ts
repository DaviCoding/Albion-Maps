import type { FastifyInstance } from "fastify"

export async function legalRoutes(app: FastifyInstance) {
    app.get("/terms", async (_req, reply) => {
        return reply.view("terms.ejs")
    })

    app.get("/privacy", async (_req, reply) => {
        return reply.view("privacy.ejs")
    })

    app.get("/about", async (_req, reply) => {
        return reply.view("about.ejs")
    })

    app.get("/contact", async (_req, reply) => {
        return reply.view("contact.ejs")
    })
}