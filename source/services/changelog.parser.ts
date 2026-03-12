import * as cheerio from "cheerio"
import type { AnyNode } from "domhandler"


interface ChangeItem {
    text: string
    children: string[]
}

interface CategoryBlock {
    category: string
    description: string | null
    changes: ChangeItem[]
}

interface Section {
    title: string
    items: ChangeItem[]
    categories: CategoryBlock[]
}

interface ParsedChangelog {
    title: string
    version: string | null
    date: string | null
    sections: Section[]
}

function parseListItems($: cheerio.CheerioAPI, ul: AnyNode): ChangeItem[] {
    const items: ChangeItem[] = []

    $(ul).children("li").each((_, li) => {
        const clone = $(li).clone()
        clone.find("ul").remove()

        const text = clone.text().trim()
        const children: string[] = []

        $(li).children("ul").children("li").each((_, child) => {
            children.push($(child).text().trim())
        })

        if (text) items.push({ text, children })
    })

    return items
}

function parseSection($: cheerio.CheerioAPI, h3: AnyNode): Section {
    const title = $(h3).text().trim()
    const items: ChangeItem[] = []
    const categories: CategoryBlock[] = []

    let current = $(h3).next()
    let pendingDescription: string | null = null
    let currentCategory: CategoryBlock | null = null

    while (current.length && !current.is("h3")) {
        const node = current[0]
        if (!node) continue

        if (current.is("blockquote")) {
            pendingDescription = current.find("em").text().trim() || null

        } else if (current.is("p") && current.find("strong").length) {
            const categoryName = current.find("strong").text().trim()

            currentCategory = {
                category: categoryName,
                description: pendingDescription,
                changes: []
            }
            categories.push(currentCategory)
            pendingDescription = null

        } else if (current.is("ul")) {
            const parsed = parseListItems($, node)

            if (currentCategory) {
                currentCategory.changes.push(...parsed)
            } else {
                items.push(...parsed)
            }

        } else if (current.is("p") && !current.find("strong").length) {
            if (pendingDescription === null && current.text().trim()) {
                pendingDescription = current.text().trim()
            }
        }

        current = current.next()
    }

    return { title, items, categories }
}

export function parseChangelogContent(html: string): ParsedChangelog {
    const $ = cheerio.load(html)
    const container = $(".small-12.columns")

    const h2Text = container.find("h2").first().text().trim()

    const parts = h2Text.split(" - ")

    const title = parts[0]?.trim() ?? h2Text
    const version = parts[1]?.match(/([\d]+\.[\d.]+)/)?.[1] ?? null
    const date = parts[2]?.trim() ?? null

    const sections: Section[] = []

    container.find("h3").each((_, h3) => {
        sections.push(parseSection($, h3))
    })

    return { title, version, date, sections }
}