import { prisma } from "../../lib/prisma";

export async function getAllPatches(gameUpdateSlug?: string) {
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
            gameUpdate: {
                select: { slug: true, name: true },
            },
        },
    });
}

export async function getPatchBySlug(slug: string) {
    return prisma.patchNote.findUnique({
        where: { slug },
        include: {
            gameUpdate: {
                select: { slug: true, name: true },
            },
            sections: {
                orderBy: { id: "asc" },
                include: {
                    subsections: {
                        orderBy: { id: "asc" },
                        include: {
                            changes: {
                                orderBy: { id: "asc" },
                                include: {
                                    stats: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
}