import { prisma } from "../../lib/prisma";

export async function getAllUpdates() {
  return prisma.gameUpdate.findMany({
    orderBy: { releaseDate: "desc" },
    include: {
      _count: { select: { patches: true } },
    },
  });
}

export async function getUpdateBySlug(slug: string) {
  return prisma.gameUpdate.findUnique({
    where: { slug },
    include: {
      patches: {
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
        },
      },
    },
  });
}