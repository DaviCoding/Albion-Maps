// prisma.client.ts
import { PrismaClient } from '@prisma/client'
import { urlPostgres } from "@/config/database.config.js"
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

export const pgProfile = new PrismaClient({
    adapter: new PrismaPg(new pg.Pool({
        connectionString: urlPostgres,
        max: 50,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    })),
})
