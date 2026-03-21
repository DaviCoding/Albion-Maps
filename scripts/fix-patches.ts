/**
 * fix-patches.ts
 * Corrige automaticamente os problemas conhecidos nos JSONs de patches.
 *
 * Padrões corrigidos:
 *   1. version: null              → ""
 *   2. ability: null              → ""
 *   3. stats[].from/to: null      → ""
 *   4. meta: {...} (formato antigo) → migra campos para o nível raiz
 *   5. sections[].subsections ausente → []
 *   6. sections[].items ausente       → []
 *   7. sections[].description ausente → null
 *
 * Uso:
 *   bun run scripts/fix-patches.ts            (dry-run, só mostra o que mudaria)
 *   bun run scripts/fix-patches.ts --write    (aplica e salva os arquivos)
 *   bun run scripts/fix-patches.ts --write --verbose
 */

import fs from "fs";
import path from "path";

const PATCHES_DIR = path.resolve(import.meta.dirname, "../prisma/seed/patches");
const args        = process.argv.slice(2);
const WRITE       = args.includes("--write");
const VERBOSE     = args.includes("--verbose");

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isArray  = (v: unknown): v is unknown[] => Array.isArray(v);

function record(fixes: Fix[], field: string, before: unknown, after: unknown) {
  fixes.push({ field, before, after });
}

// ─── Fixers por nível ─────────────────────────────────────────────────────────

function fixStat(stat: Obj, ctx: string, fixes: Fix[]) {
  for (const key of ["from", "to", "name"] as const) {
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

function fixSubsection(sub: Obj, ctx: string, fixes: Fix[]) {
  if (!isArray(sub.changes)) {
    record(fixes, `${ctx}.changes`, sub.changes, []);
    sub.changes = [];
  } else {
    (sub.changes as unknown[]).forEach((c, i) => {
      if (isObject(c)) fixChange(c, `${ctx}.changes[${i}]`, fixes);
    });
  }
  if (typeof sub.searchable_text !== "string") {
    record(fixes, `${ctx}.searchable_text`, sub.searchable_text, "");
    sub.searchable_text = "";
  }
}

function fixSection(section: Obj, ctx: string, fixes: Fix[]) {
  // description ausente
  if (!("description" in section)) {
    record(fixes, `${ctx}.description`, undefined, null);
    section.description = null;
  }
  // items ausente
  if (!isArray(section.items)) {
    record(fixes, `${ctx}.items`, section.items, []);
    section.items = [];
  }
  // subsections ausente
  if (!isArray(section.subsections)) {
    record(fixes, `${ctx}.subsections`, section.subsections, []);
    section.subsections = [];
  } else {
    (section.subsections as unknown[]).forEach((sub, i) => {
      if (isObject(sub)) fixSubsection(sub, `${ctx}.subsections[${i}]`, fixes);
    });
  }
  if (typeof section.searchable_text !== "string") {
    record(fixes, `${ctx}.searchable_text`, section.searchable_text, "");
    section.searchable_text = "";
  }
}

function fixPatchNote(patch: Obj, ctx: string, fixes: Fix[]): Obj {
  // ── Padrão 4: formato antigo com campo "meta" ────────────────────────────
  if ("meta" in patch && isObject(patch.meta)) {
    const meta = patch.meta as Obj;
    record(fixes, `${ctx} [migração meta→raiz]`, Object.keys(meta).join(", "), "campos movidos para raiz");

    // Extrai campos do meta para a raiz, preserva sections
    const sections = patch.sections;
    const newPatch: Obj = {
      slug:        meta.slug        ?? "",
      game_update: meta.game_update ?? "",
      patch_name:  meta.patch_name  ?? "",
      version:     meta.version     ?? "",
      revision:    meta.revision    ?? null,
      date:        meta.date        ?? "",
      date_iso:    meta.date_iso    ?? "",
      description: meta.description ?? "",
      keywords:    isArray(meta.keywords) ? meta.keywords : [],
      source_url:  meta.source_url  ?? "",
      sections:    isArray(sections) ? sections : [],
    };
    // Continua fixando o patch já migrado
    return fixPatchNote(newPatch, ctx, fixes);
  }

  // ── Padrão 1: version: null ──────────────────────────────────────────────
  if (patch.version === null) {
    record(fixes, `${ctx}.version`, null, "");
    patch.version = "";
  }

  // ── revision ausente ──────────────────────────────────────────────────────
  if (!("revision" in patch)) {
    record(fixes, `${ctx}.revision`, undefined, null);
    patch.revision = null;
  }

  // ── keywords ausente ou não-array ─────────────────────────────────────────
  if (!isArray(patch.keywords)) {
    record(fixes, `${ctx}.keywords`, patch.keywords, []);
    patch.keywords = [];
  }

  // ── sections ──────────────────────────────────────────────────────────────
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
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
  blue:   "\x1b[34m",
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
  const clean     = reports.filter((r) => r.fixes.length === 0);

  // ── Relatório de correções ────────────────────────────────────────────────
  if (withFixes.length > 0) {
    console.log(col(C.bold, `📋 ${withFixes.length} arquivo(s) com correções:\n`));
    for (const r of withFixes) {
      const status = WRITE
        ? col(C.green, "✓ salvo")
        : col(C.yellow, "○ pendente");
      console.log(`  ${status}  ${col(C.bold, r.file)}  ${col(C.gray, `(${r.fixes.length} correção/ões)`)}`);

      if (VERBOSE) {
        for (const fix of r.fixes) {
          const field  = col(C.cyan,  fix.field.padEnd(60));
          const before = col(C.red,   JSON.stringify(fix.before));
          const after  = col(C.green, JSON.stringify(fix.after));
          console.log(`       ${field} ${before} → ${after}`);
        }
      }
    }
    console.log();
  }

  // ── Arquivos sem problemas ────────────────────────────────────────────────
  if (VERBOSE && clean.length > 0) {
    console.log(col(C.gray, `✓ ${clean.length} arquivo(s) sem correções necessárias.\n`));
  }

  // ── Sumário ───────────────────────────────────────────────────────────────
  const totalFixes = reports.reduce((acc, r) => acc + r.fixes.length, 0);
  console.log(col(C.bold, "─".repeat(65)));
  console.log(
    `  Arquivos processados : ${files.length}  |  ` +
    col(C.yellow, `Com correções: ${withFixes.length}`) + "  |  " +
    col(C.green,  `Limpos: ${clean.length}`)
  );
  console.log(`  Correções totais     : ${totalFixes}`);
  if (WRITE) {
    console.log(`  Arquivos salvos      : ${reports.filter((r) => r.written).length}`);
  }
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