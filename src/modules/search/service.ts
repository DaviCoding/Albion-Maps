import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SearchResult, ChangeResult, SectionResult, SearchMeta } from "./types";

export type { SearchResult, SearchMeta };

const PER_PAGE = 20;

// ── Filtros opcionais aceitos pela rota ────────────────────────────
export interface SearchFilters {
    kind?: "change" | "section" | "all";
    dateFrom?: string;   // "YYYY-MM-DD"
    dateTo?: string;   // "YYYY-MM-DD"
    gameUpdate?: string;   // slug, ex: "realm-divided"
}

// ── Helpers ────────────────────────────────────────────────────────
function buildContainsFilter(
    terms: string[]
): Prisma.StringFilter | { AND: { contains: string; mode: "insensitive" }[] } {
    if (terms.length === 1) {
        return { contains: terms[0]!, mode: "insensitive" };
    }
    return {
        AND: terms.map((t) => ({ contains: t, mode: "insensitive" as const })),
    } as any;
}

function parseDateParam(s: string | undefined): Date | undefined {
    if (!s) return undefined;
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
}


// Troca o AND-de-contains por um único contains com espaços (phrase)
// ou por um OR se o separador for "/"
// Mas para manter o comportamento de "todos os termos presentes", usa nested AND via Prisma nativo:

function buildTextWhere(field: string, terms: string[]): Prisma.StringFilter<string> {
    // Caso simples — um termo só
    if (terms.length === 1) {
        return { contains: terms[0]!, mode: "insensitive" };
    }
    // Múltiplos termos: retorna apenas o primeiro como StringFilter,
    // o AND entre termos é tratado na camada do WhereInput (ver abaixo)
    return { contains: terms[0]!, mode: "insensitive" };
}

// Para AND multi-termo, monta como Prisma.SectionWhereInput[] dentro de AND:
function buildSectionTextFilter(terms: string[]): Prisma.SectionWhereInput[] {
    return terms.map((t) => ({
        searchText: { contains: t, mode: "insensitive" as const },
    }));
}

function buildChangeTextFilter(terms: string[]): Prisma.ChangeWhereInput[] {
    return terms.map((t) => ({
        searchText: { contains: t, mode: "insensitive" as const },
    }));
}
// ── Main ───────────────────────────────────────────────────────────
export async function searchChanges(
    rawQuery: string,
    page = 1,
    filters: SearchFilters = {}
): Promise<{ results: SearchResult[]; meta: SearchMeta }> {
    const q = rawQuery.trim();

    // Query vazia mas com filtros ainda retorna resultados
    const hasQuery = q.length > 0;

    const terms = hasQuery ? q.split("/").map((t) => t.trim()).filter(Boolean) : [];
    const textFilter = hasQuery ? buildContainsFilter(terms) : undefined;

    const dateGte = parseDateParam(filters.dateFrom);
    const dateLte = parseDateParam(filters.dateTo);
    const dateFilter: Prisma.DateTimeFilter | undefined =
        dateGte || dateLte
            ? { ...(dateGte ? { gte: dateGte } : {}), ...(dateLte ? { lte: dateLte } : {}) }
            : undefined;

    const kind = filters.kind ?? "all";
    const skip = (page - 1) * PER_PAGE;

    const changeWhere: Prisma.ChangeWhereInput = {
        ...(terms.length > 0 ? { AND: buildChangeTextFilter(terms) } : {}),
        ...(dateFilter ? { patchDate: dateFilter } : {}),
        ...(filters.gameUpdate ? { gameUpdateName: filters.gameUpdate } : {}),
    };

    const sectionWhere: Prisma.SectionWhereInput = {
        items: { isEmpty: false },
        ...(terms.length > 0 ? { AND: buildSectionTextFilter(terms) } : {}),
        ...(filters.gameUpdate || dateFilter
            ? {
                patchNote: {
                    ...(dateFilter ? { dateIso: dateFilter } : {}),
                    ...(filters.gameUpdate
                        ? { gameUpdate: { slug: filters.gameUpdate } }
                        : {}),
                },
            }
            : {}),
    };

    // ── Executa apenas o(s) tipo(s) necessário(s) ──────────────────
    const runChanges = kind !== "section";
    const runSections = kind !== "change";

    const [
        totalChanges,
        totalSections,
        rawChanges,
        rawSections,
    ] = await Promise.all([
        runChanges ? prisma.change.count({ where: changeWhere }) : Promise.resolve(0),
        runSections ? prisma.section.count({ where: sectionWhere }) : Promise.resolve(0),
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
    ]);

    // ── Map ────────────────────────────────────────────────────────
    const changeResults: ChangeResult[] = (rawChanges as any[]).map((c) => ({
        kind: "change",
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

    const sectionResults: SectionResult[] = (rawSections as any[]).map((s) => ({
        kind: "section",
        id: s.id,
        description: s.description,
        items: s.items as string[],
        sectionHeading: s.heading,
        subsectionHeading: null,
        patchSlug: s.patchNote.slug,
        patchVersion: s.patchNote.version,
        patchDate: s.patchNote.dateIso,
        gameUpdateName: s.patchNote.gameUpdate.name,
        gameUpdateSlug: s.patchNote.gameUpdate.slug,
        patchName: s.patchNote.patchName,
    }));

    // Merge por data desc
    const merged: SearchResult[] = [...changeResults, ...sectionResults].sort(
        (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
    );

    const total = totalChanges + totalSections;

    return {
        results: merged,
        meta: {
            query: q,
            terms,
            total,
            page,
            totalPages: Math.ceil(total / PER_PAGE),
            perPage: PER_PAGE,
            filters: { ...filters, kind: kind },
            counts: { changes: totalChanges, sections: totalSections },
        },
    };
}