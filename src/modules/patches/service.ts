import { prisma } from "../../lib/prisma";
import type { ItemJson } from "../search/types";
import type { PatchSummary, PatchDetail } from "./types";

function asItems(raw: unknown): ItemJson[] {
    return Array.isArray(raw) ? (raw as ItemJson[]) : [];
}

export async function getAllPatches(gameUpdateSlug?: string): Promise<PatchSummary[]> {
    return prisma.patchNote.findMany({
        ...(gameUpdateSlug && {
            where: { gameUpdate: { slug: gameUpdateSlug } },
        }),
        orderBy: { dateIso: "desc" },
        select: {
            id: true,
            slug: true,
            patchName: true,
            version: true,
            date: true,
            dateIso: true,
            description: true,
            keywords: true,
            gameUpdate: { select: { slug: true, name: true } },
        },
    });
}

export async function getPatchBySlug(slug: string): Promise<PatchDetail | null> {
    const patch = await prisma.patchNote.findUnique({
        where: { slug },
        include: {
            gameUpdate: { select: { slug: true, name: true } },
            sections: {
                orderBy: { id: "asc" },
                include: {
                    subsections: {
                        orderBy: { id: "asc" },
                        include: {
                            changes: {
                                orderBy: { id: "asc" },
                                include: { stats: true },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!patch) return null;

    return {
        ...patch,
        sections: patch.sections.map((sec) => ({
            ...sec,
            items: asItems(sec.items),
            subsections: sec.subsections.map((sub) => ({
                ...sub,
                items: sub.items != null ? asItems(sub.items) : undefined,
            })),
        })),
    };
}