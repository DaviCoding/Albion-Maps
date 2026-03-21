import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";

export interface SearchResult {
    id: number;
    ability: string;
    rawText: string;
    notes: string[];
    stats: { name: string; from: string; to: string }[];
    sectionHeading: string;
    subsectionHeading: string | null;
    patchSlug: string;
    patchVersion: string;
    patchDate: Date;
    gameUpdateName: string;
    patchName: string;
    gameUpdateSlug: string;
}

export interface SearchMeta {
    query: string;
    terms: string[];
    total: number;
    page: number;
    totalPages: number;
    perPage: number;
}

const PER_PAGE = 20;

export async function searchChanges(
    rawQuery: string,
    page = 1
): Promise<{ results: SearchResult[]; meta: SearchMeta }> {
    const q = rawQuery.trim();
    if (!q) {
        return {
            results: [],
            meta: { query: q, terms: [], total: 0, page, totalPages: 0, perPage: PER_PAGE },
        };
    }

    const terms = q.split("/").map((t) => t.trim()).filter(Boolean);

    // Constrói where sem undefined — spread condicional
    const where: Prisma.ChangeWhereInput = terms.length === 1
        ? { searchText: { contains: terms[0]!, mode: "insensitive" } }
        : { AND: terms.map((t) => ({ searchText: { contains: t, mode: "insensitive" as const } })) };

    const skip = (page - 1) * PER_PAGE;

    const [total, changes] = await Promise.all([
        prisma.change.count({ where }),
        prisma.change.findMany({
            where,
            skip,
            take: PER_PAGE,
            orderBy: { patchDate: "desc" },
            include: {
                stats: {
                    select: { name: true, from: true, to: true },
                },
                subsection: {
                    select: {
                        section: {
                            select: {
                                patchNote: {
                                    select: {
                                        patchName: true,
                                        gameUpdate: { select: { slug: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }),
    ]);

    const results: SearchResult[] = changes.map((c) => ({
        id: c.id,
        ability: c.ability,
        rawText: c.rawText,
        notes: c.notes,
        stats: c.stats,
        sectionHeading: c.sectionHeading,
        subsectionHeading: c.subsectionHeading,
        patchSlug: c.patchSlug,
        patchVersion: c.patchVersion,
        patchDate: c.patchDate,
        gameUpdateName: c.gameUpdateName,
        patchName: c.subsection?.section?.patchNote?.patchName ?? c.patchSlug,
        gameUpdateSlug: c.subsection?.section?.patchNote?.gameUpdate?.slug ?? "",
    }));

    return {
        results,
        meta: {
            query: q,
            terms,
            total,
            page,
            totalPages: Math.ceil(total / PER_PAGE),
            perPage: PER_PAGE,
        },
    };
}