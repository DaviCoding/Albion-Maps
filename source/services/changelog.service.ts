import * as cheerio from "cheerio"
import { http } from "@/http.js"
import { parseChangelogContent } from "@/services/changelog.parser.js"
import type { Changelog, GameUpdate, GameUpdateWithChangelogs } from "@/types.js"
import { pgProfile } from "@/database/prisma.client.js"

const BASE = "https://albiononline.com"

export class ChangelogService {
    async getUpdates(): Promise<GameUpdate[]> {
        const cached = await pgProfile.gameUpdate.findMany({
            orderBy: { createdAt: "desc" }
        })

        if (cached.length > 0) return cached

        const scraped = await this.scrapeUpdates()

        await pgProfile.gameUpdate.createMany({
            data: scraped,
            skipDuplicates: true
        })

        return scraped
    }

    async getChangelogs(updateSlug: string): Promise<Changelog[]> {
        const update = await pgProfile.gameUpdate.findUnique({
            where: { slug: updateSlug },
            include: { changelogs: { orderBy: { createdAt: "asc" } } }
        })

        if (update?.changelogs.length) return update.changelogs

        const scraped = await this.scrapeChangelogs(updateSlug)

        if (scraped.length > 0) {
            const gameUpdate = await pgProfile.gameUpdate.findUnique({
                where: { slug: updateSlug }
            })

            if (gameUpdate) {
                await pgProfile.changelog.createMany({
                    data: scraped.map(c => ({ ...c, gameUpdateId: gameUpdate.id })),
                    skipDuplicates: true
                })
            }
        }

        return scraped
    }

    async getFullTree(): Promise<GameUpdateWithChangelogs[]> {
        const updates = await pgProfile.gameUpdate.findMany({
            include: { changelogs: { orderBy: { createdAt: "asc" } } }
        })

        if (updates.length > 0) {
            return updates.sort((a, b) => this.extractYear(b.date) - this.extractYear(a.date))
        }

        const scraped = await this.scrapeUpdates()
        const result: GameUpdateWithChangelogs[] = []

        for (const update of scraped) {
            const changelogs = await this.scrapeChangelogs(update.slug)

            const created = await pgProfile.gameUpdate.upsert({
                where: { slug: update.slug },
                create: update,
                update: {}
            })

            await pgProfile.changelog.createMany({
                data: changelogs.map(c => ({ ...c, gameUpdateId: created.id })),
                skipDuplicates: true
            })

            result.push({ ...update, changelogs })
            await this.delay(300)
        }

        return result.sort((a, b) => this.extractYear(b.date) - this.extractYear(a.date))
    }

    async getChangelogContent(slug: string) {
        const cached = await pgProfile.changelogContent.findUnique({
            where: { changelogId: (await pgProfile.changelog.findUnique({ where: { slug } }))?.id ?? "" },
            include: {
                sections: {
                    orderBy: { order: "asc" },
                    include: {
                        items: { orderBy: { order: "asc" } },
                        categories: {
                            orderBy: { order: "asc" },
                            include: { changes: { orderBy: { order: "asc" } } }
                        }
                    }
                }
            }
        })

        if (cached) return cached

        const parsed = await this.scrapeChangelogContent(slug)

        const changelog = await pgProfile.changelog.findUnique({ where: { slug } })

        if (changelog) {
            await pgProfile.changelogContent.create({
                data: {
                    changelogId: changelog.id,
                    title: parsed.title,
                    version: parsed.version,
                    date: parsed.date,
                    sections: {
                        create: parsed.sections.map((section, si) => ({
                            title: section.title,
                            order: si,
                            items: {
                                create: section.items.map((item, ii) => ({
                                    text: item.text,
                                    children: item.children,
                                    order: ii
                                }))
                            },
                            categories: {
                                create: section.categories.map((cat, ci) => ({
                                    category: cat.category,
                                    description: cat.description,
                                    order: ci,
                                    changes: {
                                        create: cat.changes.map((change, chi) => ({
                                            text: change.text,
                                            children: change.children,
                                            order: chi
                                        }))
                                    }
                                }))
                            }
                        }))
                    }
                }
            })
        }

        return parsed
    }

    async syncIfUpdated(): Promise<boolean> {
        const latestOnSite = await this.fetchLatestSlug()

        if (!latestOnSite) {
            console.warn("[sync] Could not determine latest slug from site")
            return false
        }

        const exists = await pgProfile.changelog.findUnique({
            where: { slug: latestOnSite },
            select: { slug: true }
        })

        if (exists) {
            console.log(`[sync] Up to date — latest: ${latestOnSite}`)
            return false
        }

        console.log(`[sync] New changelog detected: ${latestOnSite}`)

        const updateSlug = await this.resolveUpdateSlug(latestOnSite)

        if (!updateSlug) {
            console.warn(`[sync] Could not resolve update for: ${latestOnSite}`)
            return false
        }

        const gameUpdate = await pgProfile.gameUpdate.findUnique({ where: { slug: updateSlug } })

        if (!gameUpdate) {
            console.warn(`[sync] Update not in db: ${updateSlug}`)
            return false
        }

        const scraped = await this.scrapeChangelogs(updateSlug)

        await pgProfile.changelog.createMany({
            data: scraped.map(c => ({ ...c, gameUpdateId: gameUpdate.id })),
            skipDuplicates: true
        })

        console.log(`[sync] Synced ${scraped.length} changelogs for: ${updateSlug}`)
        return true
    }

    async search(query: string) {
        const q = query.trim()

        const grouped = new Map<string, {
            changelog: { slug: string; title: string; date: string }
            update: { name: string; slug: string }
            matches: { category: string; text: string; children: string[] }[]
        }>()

        const ensure = (changelog: any, update: any) => {
            if (!grouped.has(changelog.slug)) {
                grouped.set(changelog.slug, {
                    changelog: { slug: changelog.slug, title: changelog.title, date: changelog.date },
                    update: { name: update.name, slug: update.slug },
                    matches: []
                })
            }
            return grouped.get(changelog.slug)!
        }

        const byTitle = await pgProfile.changelog.findMany({
            where: { title: { contains: q, mode: "insensitive" } },
            include: { gameUpdate: true },
            take: 50
        })

        for (const r of byTitle) {
            ensure(r, r.gameUpdate)
        }

        const byChange = await pgProfile.categoryChange.findMany({
            where: {
                OR: [
                    { text: { contains: q, mode: "insensitive" } },
                    { categoryBlock: { category: { contains: q, mode: "insensitive" } } },
                    { categoryBlock: { description: { contains: q, mode: "insensitive" } } },
                ]
            },
            distinct: ["id"],
            include: {
                categoryBlock: {
                    include: {
                        section: {
                            include: {
                                content: {
                                    include: {
                                        changelog: { include: { gameUpdate: true } }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            take: 50
        })

        const seenChanges = new Set<string>()
        for (const r of byChange) {
            if (seenChanges.has(r.id)) continue
            seenChanges.add(r.id)

            const changelog = r.categoryBlock.section.content.changelog
            ensure(changelog, changelog.gameUpdate).matches.push({
                category: r.categoryBlock.category,
                text: r.text,
                children: r.children
            })
        }

        const byItem = await pgProfile.sectionItem.findMany({
            where: { text: { contains: q, mode: "insensitive" } },
            distinct: ["id"],
            include: {
                section: {
                    include: {
                        content: {
                            include: {
                                changelog: { include: { gameUpdate: true } }
                            }
                        }
                    }
                }
            },
            take: 50
        })

        const seenItems = new Set<string>()
        for (const r of byItem) {
            if (seenItems.has(r.id)) continue
            seenItems.add(r.id)

            const changelog = r.section.content.changelog
            ensure(changelog, changelog.gameUpdate).matches.push({
                category: r.section.title,
                text: r.text,
                children: r.children
            })
        }

        return [...grouped.values()]
    }

    private extractYear(date: string): number {
        return parseInt(date.match(/\b(\d{4})\b/)?.[1] ?? "0")
    }

    private async resolveUpdateSlug(changelogSlug: string): Promise<string | null> {
        const updates = await pgProfile.gameUpdate.findMany({ select: { slug: true } })

        return updates.find(u => changelogSlug.startsWith(u.slug))?.slug ?? null
    }

    private async scrapeUpdates(): Promise<GameUpdate[]> {
        const { data } = await http.get(`${BASE}/en/changelog`)
        const $ = cheerio.load(data)
        const updates: GameUpdate[] = []

        $(".sidebar").first().find(".sidebar-item").each((_, el) => {
            const anchor = $(el).find("a.sidebar-link")
            const href = anchor.attr("href") ?? ""
            const slug = href.split("/update/")[1] ?? ""
            const lines = anchor.find(".sidebar-text").text().trim()
                .split("\n").map(l => l.trim()).filter(Boolean)

            const name = lines[0] ?? ""
            const date = lines[1] ?? ""
            const thumbnail = anchor.find("img").attr("src") ?? null

            if (name && slug) updates.push({ name, slug, date, thumbnail })
        })

        return updates
    }

    private async fetchLatestSlug(): Promise<string | null> {
        try {
            const { data } = await http.get(`${BASE}/changelog/__latest_probe__`)
            const $ = cheerio.load(data)
            const ogUrl = $('meta[property="og:url"]').attr("content") ?? ""
            return ogUrl.split("/changelog/")[1] ?? null
        } catch {
            return null
        }
    }

    private async scrapeChangelogs(updateSlug: string): Promise<Omit<Changelog, "gameUpdateId">[]> {
        const changelogs: Omit<Changelog, "gameUpdateId">[] = []
        let misses = 0

        for (const slug of this.candidateSlugs(updateSlug)) {
            const ogTitle = await this.fetchOgTitle(slug)
            const matched = this.matchesUpdate(ogTitle, updateSlug)

            if (matched && ogTitle) {
                changelogs.push({ title: ogTitle, slug, date: "", url: `${BASE}/changelog/${slug}` })
                misses = 0
            } else {
                if (++misses >= 3) break
            }

            await this.delay(800) // era 150ms — aumentado para 800ms
        }

        if (changelogs.length > 0) await this.enrichDates(changelogs)

        console.log(`[changelogs] ${updateSlug} → ${changelogs.length} found`)
        return changelogs
    }

    private async scrapeChangelogContent(slug: string) {
        const { data } = await http.get(`${BASE}/changelog/${slug}`)
        const $ = cheerio.load(data)
        const html = $(".small-12.medium-8.large-9.columns").html() ?? ""
        return parseChangelogContent(`<div class="small-12 columns">${html}</div>`)
    }

    private async fetchOgTitle(slug: string): Promise<string | null> {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const { data } = await http.get(`${BASE}/changelog/${slug}`)
                const $ = cheerio.load(data)
                return $('meta[property="og:title"]').attr("content") ?? null
            } catch (err: any) {
                const status = err?.response?.status

                if (status === 429) {
                    const wait = attempt * 2000
                    console.warn(`[fetchOgTitle] ${slug} → 429, retrying in ${wait}ms (attempt ${attempt}/3)`)
                    await this.delay(wait)
                    continue
                }

                if (status !== 404) {
                    console.error(`[fetchOgTitle] ${slug} → ${status} ${err.message}`)
                }
                return null
            }
        }
        return null
    }

    private matchesUpdate(ogTitle: string | null, updateSlug: string): boolean {
        if (!ogTitle) return false
        return ogTitle.toLowerCase().includes(updateSlug.replace(/-/g, " "))
    }

    private *candidateSlugs(updateSlug: string): Generator<string> {
        yield `${updateSlug}-update`
        for (let i = 1; i <= 20; i++) yield `${updateSlug}-patch-${i}`
        yield `${updateSlug}-part-ii`
        yield `${updateSlug}-part-iii`
    }

    private async enrichDates(changelogs: Omit<Changelog, "gameUpdateId">[]): Promise<void> {
        for (const changelog of changelogs) {
            try {
                const { data } = await http.get(changelog.url)
                const $ = cheerio.load(data)
                const desc = $('meta[property="og:description"]').attr("content") ?? ""

                const patterns = [
                    /[-–]\s*([A-Z][a-z]+ \d{1,2},\s*\d{4})/,
                    /(\w+ \d{1,2},\s*\d{4})/,
                ]

                for (const pattern of patterns) {
                    const match = desc.match(pattern)
                    if (match?.[1]) {
                        changelog.date = match[1].trim()
                        break
                    }
                }
            } catch {
                console.log(`[enrichDates] Could not enrich date for ${changelog.slug}`)
            }

            await this.delay(200)
        }
    }

    private delay(ms: number) {
        return new Promise(res => setTimeout(res, ms))
    }
}