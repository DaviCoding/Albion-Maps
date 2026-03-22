import { prisma } from "../../lib/prisma";
import { Prisma } from "@prisma/client";
import type {
    SearchResult, ChangeResult, SectionResult, SubsectionResult,
    SearchMeta, ItemJson,
} from "./types";

export type { SearchResult, SearchMeta };

const PER_PAGE = 20;

// ── Filtros ───────────────────────────────────────────────────────
export interface SearchFilters {
    kind?: "change" | "section" | "subsection" | "all";
    dateFrom?: string;  // "YYYY-MM-DD"
    dateTo?: string;  // "YYYY-MM-DD"
    gameUpdate?: string;  // slug, ex: "realm-divided"
}

// ── Helpers ───────────────────────────────────────────────────────
function parseDateParam(s?: string): Date | undefined {
    if (!s) return undefined;
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
}

function asItems(raw: unknown): ItemJson[] {
    return Array.isArray(raw) ? (raw as ItemJson[]) : [];
}

function changeTextFilter(terms: string[]): Prisma.ChangeWhereInput[] {
    return terms.map((t) => ({
        searchText: { contains: t, mode: "insensitive" as const },
    }));
}

function sectionTextFilter(terms: string[]): Prisma.SectionWhereInput[] {
    return terms.map((t) => ({
        searchText: { contains: t, mode: "insensitive" as const },
    }));
}

function subsectionTextFilter(terms: string[]): Prisma.SubsectionWhereInput[] {
    return terms.map((t) => ({
        searchText: { contains: t, mode: "insensitive" as const },
    }));
}

// ── Main ──────────────────────────────────────────────────────────
export async function searchChanges(
    rawQuery: string,
    page = 1,
    filters: SearchFilters = {},
): Promise<{ results: SearchResult[]; meta: SearchMeta }> {
    const q = rawQuery.trim();
    const hasQuery = q.length > 0;
    const terms = hasQuery
        ? q.split("/").map((t) => t.trim()).filter(Boolean)
        : [];

    const dateGte = parseDateParam(filters.dateFrom);
    const dateLte = parseDateParam(filters.dateTo);
    const dateFilter: Prisma.DateTimeFilter | undefined =
        dateGte || dateLte
            ? { ...(dateGte ? { gte: dateGte } : {}), ...(dateLte ? { lte: dateLte } : {}) }
            : undefined;

    const kind = filters.kind ?? "all";
    const skip = (page - 1) * PER_PAGE;

    // ── Where clauses ─────────────────────────────────────────────
    const changeWhere: Prisma.ChangeWhereInput = {
        ...(terms.length > 0 ? { AND: changeTextFilter(terms) } : {}),
        ...(dateFilter ? { patchDate: dateFilter } : {}),
        ...(filters.gameUpdate ? { gameUpdateName: filters.gameUpdate } : {}),
    };

    // Seções de topo com items (ex: "Conqueror's Challenge Changes")
    // Não filtramos itens vazios via Prisma (campo Json) — fazemos no JS.
    const sectionWhere: Prisma.SectionWhereInput = {
        ...(terms.length > 0 ? { AND: sectionTextFilter(terms) } : {}),
        ...(filters.gameUpdate || dateFilter
            ? {
                patchNote: {
                    ...(dateFilter ? { dateIso: dateFilter } : {}),
                    ...(filters.gameUpdate ? { gameUpdate: { slug: filters.gameUpdate } } : {}),
                },
            }
            : {}),
    };

    // Subseções com items (ex: "Faction Enlistment Bonus", "Spell Fixes")
    const subsectionWhere: Prisma.SubsectionWhereInput = {
        NOT: { items: { equals: Prisma.AnyNull } },  // só subseções com items (Json? não-nulo)
        ...(terms.length > 0 ? { AND: subsectionTextFilter(terms) } : {}),
        ...(filters.gameUpdate || dateFilter
            ? {
                section: {
                    patchNote: {
                        ...(dateFilter ? { dateIso: dateFilter } : {}),
                        ...(filters.gameUpdate ? { gameUpdate: { slug: filters.gameUpdate } } : {}),
                    },
                },
            }
            : {}),
    };

    const runChanges = kind === "all" || kind === "change";
    const runSections = kind === "all" || kind === "section";
    const runSubsections = kind === "all" || kind === "subsection";

    // ── Queries paralelas ─────────────────────────────────────────
    const [
        totalChanges, totalSections, totalSubsections,
        rawChanges, rawSections, rawSubsections,
    ] = await Promise.all([
        runChanges ? prisma.change.count({ where: changeWhere }) : Promise.resolve(0),
        runSections ? prisma.section.count({ where: sectionWhere }) : Promise.resolve(0),
        runSubsections ? prisma.subsection.count({ where: subsectionWhere }) : Promise.resolve(0),

        runChanges
            ? prisma.change.findMany({
                where: changeWhere,
                skip,
                take: PER_PAGE,
                orderBy: { patchDate: "desc" },
                include: {
                    stats: { select: { name: true, from: true, to: true } },
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
            })
            : Promise.resolve([]),

        runSections
            ? prisma.section.findMany({
                where: sectionWhere,
                skip,
                take: PER_PAGE,
                orderBy: { patchNote: { dateIso: "desc" } },
                include: {
                    patchNote: {
                        select: {
                            slug: true,
                            version: true,
                            dateIso: true,
                            patchName: true,
                            gameUpdate: { select: { name: true, slug: true } },
                        },
                    },
                },
            })
            : Promise.resolve([]),

        runSubsections
            ? prisma.subsection.findMany({
                where: subsectionWhere,
                skip,
                take: PER_PAGE,
                orderBy: { section: { patchNote: { dateIso: "desc" } } },
                include: {
                    section: {
                        select: {
                            heading: true,
                            patchNote: {
                                select: {
                                    slug: true,
                                    version: true,
                                    dateIso: true,
                                    patchName: true,
                                    gameUpdate: { select: { name: true, slug: true } },
                                },
                            },
                        },
                    },
                },
            })
            : Promise.resolve([]),
    ]);

    // ── Map ───────────────────────────────────────────────────────
    const changeResults: ChangeResult[] = (rawChanges as any[]).map((c) => ({
        kind: "change" as const,
        id: c.id,
        ability: c.ability,
        rawText: c.rawText,
        notes: c.notes,
        stats: c.stats,
        sectionHeading: c.sectionHeading,
        subsectionHeading: c.subsectionHeading ?? null,
        patchSlug: c.patchSlug,
        patchVersion: c.patchVersion ?? null,
        patchDate: c.patchDate,
        gameUpdateName: c.gameUpdateName,
        patchName: c.subsection?.section?.patchNote?.patchName ?? c.patchSlug,
        gameUpdateSlug: c.subsection?.section?.patchNote?.gameUpdate?.slug ?? "",
    }));

    const sectionResults: SectionResult[] = (rawSections as any[])
        .filter((s) => Array.isArray(s.items) && s.items.length > 0)
        .map((s) => ({
            kind: "section" as const,
            id: s.id,
            description: s.description ?? null,
            items: asItems(s.items),
            sectionHeading: s.heading,
            subsectionHeading: null,
            patchSlug: s.patchNote.slug,
            patchVersion: s.patchNote.version ?? null,
            patchDate: s.patchNote.dateIso,
            gameUpdateName: s.patchNote.gameUpdate.name,
            gameUpdateSlug: s.patchNote.gameUpdate.slug,
            patchName: s.patchNote.patchName,
        }));

    const subsectionResults: SubsectionResult[] = (rawSubsections as any[])
        .filter((s) => Array.isArray(s.items) && s.items.length > 0)
        .map((s) => ({
            kind: "subsection" as const,
            id: s.id,
            description: s.description ?? null,
            items: asItems(s.items),
            sectionHeading: s.section.heading,
            subsectionHeading: s.heading,
            patchSlug: s.section.patchNote.slug,
            patchVersion: s.section.patchNote.version ?? null,
            patchDate: s.section.patchNote.dateIso,
            gameUpdateName: s.section.patchNote.gameUpdate.name,
            gameUpdateSlug: s.section.patchNote.gameUpdate.slug,
            patchName: s.section.patchNote.patchName,
        }));

    // Merge por data desc, desduplicando pelo id composto
    const merged: SearchResult[] = [
        ...changeResults,
        ...sectionResults,
        ...subsectionResults,
    ].sort(
        (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime(),
    );

    const total = totalChanges + totalSections + totalSubsections;

    return {
        results: merged,
        meta: {
            query: q,
            terms,
            total,
            page,
            totalPages: Math.ceil(total / PER_PAGE),
            perPage: PER_PAGE,
            filters: { ...filters, kind },
            counts: { changes: totalChanges, sections: totalSections, subsections: totalSubsections },
        },
    };
}