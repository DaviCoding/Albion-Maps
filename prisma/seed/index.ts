/**
 * prisma/seed/index.ts
 *
 * Uso:
 *   bun run prisma/seed/index.ts
 *   bun run prisma/seed/index.ts --reset
 *   bun run prisma/seed/index.ts --file=realm-divided-patch-5.json
 */

import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import fs from "fs";
import path from "path";

const PATCHES_DIR = path.resolve(import.meta.dirname, "./patches");
const args = process.argv.slice(2);
const RESET = args.includes("--reset");
const SINGLE = args.find((a) => a.startsWith("--file="))?.replace("--file=", "");

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StatJson {
  name: string;
  from: string;
  to: string;
}

interface ChangeJson {
  ability: string;
  raw_text: string;
  stats: StatJson[];
  notes: string[];
}

/** Item de section ou subsection geral: objeto com text + campos opcionais */
interface ItemJson {
  text: string;
  stats?: StatJson[];
  subitems?: ItemJson[];
}

/**
 * Subsection polimórfica:
 *   - Combat balance → tem `changes[]`
 *   - Geral          → tem `items[]`
 */
interface SubsectionJson {
  heading: string;
  searchable_text: string;
  description?: string | null;
  // combat balance
  changes?: ChangeJson[];
  // general patch
  items?: ItemJson[];
}

interface SectionJson {
  heading: string;
  description: string | null;
  items: ItemJson[];       // objetos { text, stats?, subitems? }
  searchable_text: string;
  subsections: SubsectionJson[];
}

interface PatchNoteJson {
  slug: string;
  game_update: string;
  patch_name: string;
  version: string | null;       // pode ser null
  revision: string | null;
  date: string;
  date_iso: string;
  description: string;
  keywords: string[];
  source_url: string;
  sections: SectionJson[];
}

// ─── Cores ────────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m",
  red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
const col = (c: string, t: string) => `${c}${t}${C.reset}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Serializa um ItemJson (e seus subitems) para texto plano buscável. */
function itemToSearchText(item: ItemJson): string {
  const parts = [item.text];
  if (item.stats) parts.push(...item.stats.flatMap((s) => [s.name, s.from, s.to]));
  if (item.subitems) parts.push(...item.subitems.map(itemToSearchText));
  return parts.filter(Boolean).join(" ");
}

// ─── GameUpdate cache ─────────────────────────────────────────────────────────

const gameUpdateCache = new Map<string, number>();

async function getOrCreateGameUpdate(name: string): Promise<number> {
  if (gameUpdateCache.has(name)) return gameUpdateCache.get(name)!;

  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const record = await prisma.gameUpdate.upsert({
    where: { name },
    update: {},
    create: { slug, name },
    select: { id: true },
  });

  gameUpdateCache.set(name, record.id);
  return record.id;
}

// ─── Seed de um PatchNote ─────────────────────────────────────────────────────

async function seedPatchNote(patch: PatchNoteJson): Promise<void> {
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

  // Pula se sections já foram criadas
  const existing = await prisma.section.count({ where: { patchNoteId: patchNote.id } });
  if (existing > 0) return;

  for (const sec of patch.sections) {
    const section = await prisma.section.create({
      data: {
        patchNoteId: patchNote.id,
        heading: sec.heading,
        description: sec.description,
        items: (sec.items ?? []) as unknown as Prisma.InputJsonValue,  // ItemJson[] → Json
        searchText: sec.searchable_text,
      },
    });

    for (const sub of sec.subsections) {
      const subsection = await prisma.subsection.create({
        data: {
          sectionId: section.id,
          heading: sub.heading,
          description: sub.description ?? null,
          searchText: sub.searchable_text,
        },
      });

      // ── Combat balance: processa changes ──────────────────────────────────
      if (sub.changes && sub.changes.length > 0) {
        for (const ch of sub.changes) {
          const searchText = [
            patch.game_update, patch.patch_name, patch.slug, patch.version,
            sec.heading, sub.heading, ch.ability, ch.raw_text,
            ...ch.notes,
            ...ch.stats.flatMap((s) => [s.name, s.from, s.to]),
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
              data: ch.stats.map((s) => ({
                changeId: change.id,
                name: s.name,
                from: s.from,
                to: s.to,
              })),
            });
          }
        }
      }

      // ── General patch: processa items da subsection ───────────────────────
      if (sub.items && sub.items.length > 0) {
        await prisma.subsection.update({
          where: { id: subsection.id },
          data: { items: sub.items as unknown as Prisma.InputJsonValue },
        });
      }
    }
  }
}

// ─── Pós-seed: preenche releaseDate de cada GameUpdate ───────────────────────

async function backfillReleaseDates(): Promise<void> {
  process.stdout.write(col(C.gray, "\n  Calculando releaseDates..."));

  const updates = await prisma.gameUpdate.findMany({ select: { id: true } });
  let count = 0;

  for (const update of updates) {
    const oldest = await prisma.patchNote.findFirst({
      where: { gameUpdateId: update.id },
      orderBy: { dateIso: "asc" },
      select: { dateIso: true },
    });
    if (oldest) {
      await prisma.gameUpdate.update({
        where: { id: update.id },
        data: { releaseDate: oldest.dateIso },
      });
      count++;
    }
  }

  console.log(col(C.green, ` ${count} atualizados.`));
}

// ─── Carregar JSONs ───────────────────────────────────────────────────────────

function loadPatchFiles(): { file: string; patches: PatchNoteJson[] }[] {
  const files = SINGLE
    ? [SINGLE]
    : fs.readdirSync(PATCHES_DIR).filter((f) => f.endsWith(".json")).sort();

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(PATCHES_DIR, file), "utf-8");
    const parsed = JSON.parse(raw);
    return { file, patches: Array.isArray(parsed) ? parsed : [parsed] };
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

async function resetDatabase(): Promise<void> {
  console.log(col(C.yellow, "  ⚠  Limpando banco de dados...\n"));
  await prisma.stat.deleteMany();
  await prisma.change.deleteMany();
  await prisma.subsection.deleteMany();
  await prisma.section.deleteMany();
  await prisma.patchNote.deleteMany();
  await prisma.gameUpdate.deleteMany();
  gameUpdateCache.clear();
  console.log(col(C.green, "  ✓  Banco limpo.\n"));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(col(C.bold, "\n🌱 Albion Patch Seed\n"));

  if (!fs.existsSync(PATCHES_DIR)) {
    console.error(col(C.red, `✗ Diretório não encontrado: ${PATCHES_DIR}\n`));
    process.exit(1);
  }

  if (RESET) await resetDatabase();

  const entries = loadPatchFiles();
  const totalPatches = entries.reduce((acc, e) => acc + e.patches.length, 0);

  console.log(`  ${col(C.cyan, String(entries.length))} arquivo(s)  |  ${col(C.cyan, String(totalPatches))} patch(es)\n`);

  let seeded = 0;
  let errors = 0;

  for (const { file, patches } of entries) {
    process.stdout.write(`  ${col(C.gray, file.padEnd(55))}`);

    for (const patch of patches) {
      try {
        await seedPatchNote(patch);
        seeded++;
        process.stdout.write(col(C.green, " ✓"));
      } catch (err) {
        errors++;
        process.stdout.write(col(C.red, " ✗"));
        console.log();
        console.error(col(C.red, `    Erro em [${patch.slug}]: ${err}`));
      }
    }

    console.log();
  }

  await backfillReleaseDates();

  console.log();
  console.log(col(C.bold, "─".repeat(65)));
  console.log(
    `  Patches inseridos : ${col(C.green, String(seeded))}  |  ` +
    `Erros : ${col(errors > 0 ? C.red : C.green, String(errors))}`
  );
  console.log(col(C.bold, "─".repeat(65)));

  if (errors === 0) {
    console.log(col(C.green + C.bold, "\n✓ Seed concluído com sucesso.\n"));
  } else {
    console.log(col(C.yellow, `\n⚠  Seed concluído com ${errors} erro(s).\n`));
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(col(C.red, `\n✗ Erro fatal: ${err}\n`));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());