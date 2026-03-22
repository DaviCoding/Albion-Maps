import { prisma } from "../../lib/prisma";
import { type PatchNoteJson } from "./types"


async function getOrCreateGameUpdate(name: string): Promise<number> {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const record = await prisma.gameUpdate.upsert({
    where: { name },
    update: {},
    create: { slug, name },
    select: { id: true },
  });
  return record.id;
}

export async function seedPatchNoteFromJson(patch: PatchNoteJson): Promise<void> {
  const gameUpdateId = await getOrCreateGameUpdate(patch.game_update);

  const patchNote = await prisma.patchNote.upsert({
    where: { slug: patch.slug },
    update: {},
    create: {
      slug: patch.slug,
      gameUpdateId,
      patchName: patch.patch_name,
      version: patch.version,
      revision: patch.revision,
      date: patch.date,
      dateIso: new Date(patch.date_iso),
      description: patch.description,
      keywords: patch.keywords,
      sourceUrl: patch.source_url,
    },
  });

  const existing = await prisma.section.count({ where: { patchNoteId: patchNote.id } });
  if (existing > 0) return;

  for (const sec of patch.sections) {
    const section = await prisma.section.create({
      data: {
        patchNoteId: patchNote.id,
        heading: sec.heading,
        description: sec.description,
        items: sec.items,
        searchText: sec.searchable_text,
      },
    });

    for (const sub of sec.subsections) {
      const subsection = await prisma.subsection.create({
        data: { sectionId: section.id, heading: sub.heading, searchText: sub.searchable_text },
      });

      for (const ch of sub.changes) {
        const searchText = [
          patch.game_update, patch.patch_name, patch.slug, patch.version,
          sec.heading, sub.heading, ch.ability, ch.raw_text,
          ...ch.notes, ...ch.stats.flatMap((s) => [s.name, s.from, s.to]),
        ].filter(Boolean).join(" ");

        const change = await prisma.change.create({
          data: {
            subsectionId: subsection.id,
            sectionId: section.id,
            ability: ch.ability,
            rawText: ch.raw_text,
            notes: ch.notes,
            searchText,
            gameUpdateId,
            gameUpdateName: patch.game_update,
            patchSlug: patch.slug,
            patchVersion: patch.version,
            patchDate: new Date(patch.date_iso),
            sectionHeading: sec.heading,
            subsectionHeading: sub.heading,
          },
        });

        if (ch.stats.length > 0) {
          await prisma.stat.createMany({
            data: ch.stats.map((s) => ({ changeId: change.id, name: s.name, from: s.from, to: s.to })),
          });
        }
      }
    }
  }

  // Atualiza releaseDate do GameUpdate se ainda não tem
  await prisma.gameUpdate.updateMany({
    where: { id: gameUpdateId, releaseDate: null },
    data: { releaseDate: new Date(patch.date_iso) },
  });
}