/**
 * fix-patches.ts
 * Corrige automaticamente os problemas conhecidos nos JSONs de patches.
 *
 * Padrões corrigidos (v2):
 *   1. version: null              → null  (agora é string | null, já é válido)
 *   2. revision ausente           → null
 *   3. ability/raw_text: null     → ""
 *   4. stats[].name/from/to: null → ""
 *   5. sections[].subsections ausente  → []
 *   6. sections[].items ausente        → []
 *   7. sections[].description ausente  → null
 *   8. sections[].searchable_text ausente → ""
 *   9. subsections[].searchable_text ausente → ""
 *  10. subsections[].changes ausente (combat)  → []
 *  11. subsections[].items ausente (geral)      → []
 *  12. items[]: string plana (formato antigo)  → { text: string }
 *  13. keywords ausente ou não-array → []
 *
 * Uso:
 *   bun run scripts/fix-patches.ts              (dry-run, só mostra o que mudaria)
 *   bun run scripts/fix-patches.ts --write      (aplica e salva os arquivos)
 *   bun run scripts/fix-patches.ts --write --verbose
 */

import fs from "fs";
import path from "path";

const PATCHES_DIR = path.resolve(import.meta.dirname, "../prisma/seed/patches");
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const VERBOSE = args.includes("--verbose");

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

interface Fix {
  field: string;
  before: unknown;
  after: unknown;
}

interface FileReport {
  file: string;
  fixes: Fix[];
  written: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

function record(fixes: Fix[], field: string, before: unknown, after: unknown) {
  fixes.push({ field, before, after });
}

// ─── Fixers por nível ─────────────────────────────────────────────────────────

function fixStat(stat: Obj, ctx: string, fixes: Fix[]) {
  for (const key of ["name", "from", "to"] as const) {
    if (stat[key] === null) {
      record(fixes, `${ctx}.${key}`, null, "");
      stat[key] = "";
    }
  }
}

function fixChange(change: Obj, ctx: string, fixes: Fix[]) {
  if (change.ability === null) {
    record(fixes, `${ctx}.ability`, null, "");
    change.ability = "";
  }
  if (change.raw_text === null) {
    record(fixes, `${ctx}.raw_text`, null, "");
    change.raw_text = "";
  }
  if (!isArray(change.stats)) {
    record(fixes, `${ctx}.stats`, change.stats, []);
    change.stats = [];
  } else {
    (change.stats as unknown[]).forEach((s, i) => {
      if (isObject(s)) fixStat(s, `${ctx}.stats[${i}]`, fixes);
    });
  }
  if (!isArray(change.notes)) {
    record(fixes, `${ctx}.notes`, change.notes, []);
    change.notes = [];
  }
}

/** Normaliza um item: se for string plana (formato antigo), converte para { text }. */
function fixItem(item: unknown, ctx: string, fixes: Fix[]): unknown {
  // Padrão 12: string plana → objeto
  if (typeof item === "string") {
    record(fixes, ctx, item, { text: item });
    return { text: item };
  }

  if (!isObject(item)) return item;

  // text ausente ou null
  if (!("text" in item) || item.text === null) {
    record(fixes, `${ctx}.text`, item.text ?? undefined, "");
    item.text = "";
  }

  // stats (opcional, mas se existir deve ser array)
  if ("stats" in item && !isArray(item.stats)) {
    record(fixes, `${ctx}.stats`, item.stats, []);
    item.stats = [];
  } else if (isArray(item.stats)) {
    (item.stats as unknown[]).forEach((s, i) => {
      if (isObject(s)) fixStat(s, `${ctx}.stats[${i}]`, fixes);
    });
  }

  // subitems (opcional, mas se existir deve ser array de items)
  if ("subitems" in item && !isArray(item.subitems)) {
    record(fixes, `${ctx}.subitems`, item.subitems, []);
    item.subitems = [];
  } else if (isArray(item.subitems)) {
    item.subitems = (item.subitems as unknown[]).map((sub, i) =>
      fixItem(sub, `${ctx}.subitems[${i}]`, fixes)
    );
  }

  return item;
}

function fixSubsection(sub: Obj, ctx: string, fixes: Fix[]) {
  // searchable_text ausente
  if (typeof sub.searchable_text !== "string") {
    record(fixes, `${ctx}.searchable_text`, sub.searchable_text, "");
    sub.searchable_text = "";
  }

  // description ausente
  if (!("description" in sub)) {
    record(fixes, `${ctx}.description`, undefined, null);
    sub.description = null;
  }

  const hasCombat = "changes" in sub;
  const hasGeneral = "items" in sub;

  // Combat balance: corrige changes
  if (hasCombat) {
    if (!isArray(sub.changes)) {
      record(fixes, `${ctx}.changes`, sub.changes, []);
      sub.changes = [];
    } else {
      (sub.changes as unknown[]).forEach((c, i) => {
        if (isObject(c)) fixChange(c, `${ctx}.changes[${i}]`, fixes);
      });
    }
  }

  // Geral: corrige items
  if (hasGeneral) {
    if (!isArray(sub.items)) {
      record(fixes, `${ctx}.items`, sub.items, []);
      sub.items = [];
    } else {
      sub.items = (sub.items as unknown[]).map((item, i) =>
        fixItem(item, `${ctx}.items[${i}]`, fixes)
      );
    }
  }

  // Se não tem nenhum dos dois, adiciona changes vazio (padrão combat balance)
  if (!hasCombat && !hasGeneral) {
    record(fixes, `${ctx}.changes`, undefined, []);
    sub.changes = [];
  }
}

function fixSection(section: Obj, ctx: string, fixes: Fix[]) {
  // description ausente
  if (!("description" in section)) {
    record(fixes, `${ctx}.description`, undefined, null);
    section.description = null;
  }

  // searchable_text ausente
  if (typeof section.searchable_text !== "string") {
    record(fixes, `${ctx}.searchable_text`, section.searchable_text, "");
    section.searchable_text = "";
  }

  // items: array de objetos (não strings)
  if (!isArray(section.items)) {
    record(fixes, `${ctx}.items`, section.items, []);
    section.items = [];
  } else {
    section.items = (section.items as unknown[]).map((item, i) =>
      fixItem(item, `${ctx}.items[${i}]`, fixes)
    );
  }

  // subsections
  if (!isArray(section.subsections)) {
    record(fixes, `${ctx}.subsections`, section.subsections, []);
    section.subsections = [];
  } else {
    (section.subsections as unknown[]).forEach((sub, i) => {
      if (isObject(sub)) fixSubsection(sub, `${ctx}.subsections[${i}]`, fixes);
    });
  }
}

function fixPatchNote(patch: Obj, ctx: string, fixes: Fix[]): Obj {
  // version: null é agora válido (string | null), não converte
  // revision ausente → null
  if (!("revision" in patch)) {
    record(fixes, `${ctx}.revision`, undefined, null);
    patch.revision = null;
  }

  // keywords ausente ou não-array
  if (!isArray(patch.keywords)) {
    record(fixes, `${ctx}.keywords`, patch.keywords, []);
    patch.keywords = [];
  }

  // sections
  if (!isArray(patch.sections)) {
    record(fixes, `${ctx}.sections`, patch.sections, []);
    patch.sections = [];
  } else {
    (patch.sections as unknown[]).forEach((sec, i) => {
      if (isObject(sec)) fixSection(sec, `${ctx}.sections[${i}]`, fixes);
    });
  }

  return patch;
}

// ─── Processar arquivo ────────────────────────────────────────────────────────

function processFile(filePath: string): FileReport {
  const fileName = path.basename(filePath);
  const fixes: Fix[] = [];

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error(`Erro ao ler ${fileName}: ${err}`);
    return { file: fileName, fixes: [], written: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`JSON inválido em ${fileName}: ${err}`);
    return { file: fileName, fixes: [], written: false };
  }

  let fixed: unknown;

  if (Array.isArray(parsed)) {
    fixed = (parsed as unknown[]).map((item, i) =>
      isObject(item) ? fixPatchNote(item, `[${i}]`, fixes) : item
    );
  } else if (isObject(parsed)) {
    fixed = fixPatchNote(parsed, "[0]", fixes);
  } else {
    return { file: fileName, fixes: [], written: false };
  }

  let written = false;
  if (fixes.length > 0 && WRITE) {
    fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2) + "\n", "utf-8");
    written = true;
  }

  return { file: fileName, fixes, written };
}

// ─── Cores ────────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const col = (c: string, t: string) => `${c}${t}${C.reset}`;

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(PATCHES_DIR)) {
    console.error(col(C.red, `\n✗ Diretório não encontrado: ${PATCHES_DIR}\n`));
    process.exit(1);
  }

  const files = fs.readdirSync(PATCHES_DIR).filter((f) => f.endsWith(".json")).sort();

  if (files.length === 0) {
    console.warn(col(C.yellow, `\n⚠ Nenhum .json encontrado em ${PATCHES_DIR}\n`));
    process.exit(0);
  }

  if (!WRITE) {
    console.log(col(C.yellow, "\n⚠  DRY-RUN — nenhum arquivo será alterado. Use --write para salvar.\n"));
  }

  console.log(col(C.bold, `🔧 Processando ${files.length} arquivo(s)...\n`));

  const reports: FileReport[] = files.map((f) =>
    processFile(path.join(PATCHES_DIR, f))
  );

  const withFixes = reports.filter((r) => r.fixes.length > 0);
  const clean = reports.filter((r) => r.fixes.length === 0);

  if (withFixes.length > 0) {
    console.log(col(C.bold, `📋 ${withFixes.length} arquivo(s) com correções:\n`));
    for (const r of withFixes) {
      const status = WRITE
        ? col(C.green, "✓ salvo")
        : col(C.yellow, "○ pendente");
      console.log(`  ${status}  ${col(C.bold, r.file)}  ${col(C.gray, `(${r.fixes.length} correção/ões)`)}`);

      if (VERBOSE) {
        for (const fix of r.fixes) {
          const field = col(C.cyan, fix.field.padEnd(60));
          const before = col(C.red, JSON.stringify(fix.before));
          const after = col(C.green, JSON.stringify(fix.after));
          console.log(`       ${field} ${before} → ${after}`);
        }
      }
    }
    console.log();
  }

  if (VERBOSE && clean.length > 0) {
    console.log(col(C.gray, `✓ ${clean.length} arquivo(s) sem correções necessárias.\n`));
  }

  const totalFixes = reports.reduce((acc, r) => acc + r.fixes.length, 0);
  console.log(col(C.bold, "─".repeat(65)));
  console.log(
    `  Arquivos processados : ${files.length}  |  ` +
    col(C.yellow, `Com correções: ${withFixes.length}`) + "  |  " +
    col(C.green, `Limpos: ${clean.length}`)
  );
  console.log(`  Correções totais     : ${totalFixes}`);
  if (WRITE)
    console.log(`  Arquivos salvos      : ${reports.filter((r) => r.written).length}`);
  console.log(col(C.bold, "─".repeat(65)));

  if (!WRITE && withFixes.length > 0) {
    console.log(col(C.yellow, `\n  Execute com --write para aplicar as ${totalFixes} correção/ões.\n`));
  } else if (WRITE && withFixes.length > 0) {
    console.log(col(C.green + C.bold, "\n✓ Correções aplicadas. Rode o validador para confirmar:\n"));
    console.log(col(C.gray, "  bun run scripts/validate-patches.ts\n"));
  } else {
    console.log(col(C.green + C.bold, "\n✓ Nenhuma correção necessária.\n"));
  }
}

main();