/**
 * validate-patches.ts
 * Valida todos os JSONs em ../prisma/seed/patches contra o schema esperado.
 *
 * Uso (Bun):
 *   bun run scripts/validate-patches.ts
 *   bun run scripts/validate-patches.ts --fix
 *   bun run scripts/validate-patches.ts --verbose
 */

import fs from "fs";
import path from "path";

const PATCHES_DIR = path.resolve(import.meta.dirname, "../prisma/seed/patches");
const args = process.argv.slice(2);
const VERBOSE = args.includes("--verbose");
const FIX = args.includes("--fix");

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

interface ValidationError {
  path: string;
  message: string;
}

// ─── Helpers de tipo ─────────────────────────────────────────────────────────

const isString      = (v: unknown): v is string  => typeof v === "string";
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isArray       = (v: unknown): v is unknown[] => Array.isArray(v);
const isObject      = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function ve(fieldPath: string, message: string): ValidationError {
  return { path: fieldPath, message };
}

// ─── Validadores por nível ────────────────────────────────────────────────────

function validateStat(stat: unknown, ctx: string): ValidationError[] {
  if (!isObject(stat)) return [ve(ctx, "deve ser um objeto")];
  const errs: ValidationError[] = [];

  if (!isString(stat.name))
    errs.push(ve(`${ctx}.name`, `esperado string, recebeu ${JSON.stringify(stat.name)}`));
  if (!isString(stat.from))
    errs.push(ve(`${ctx}.from`, `esperado string, recebeu ${JSON.stringify(stat.from)}`));
  if (!isString(stat.to))
    errs.push(ve(`${ctx}.to`, `esperado string, recebeu ${JSON.stringify(stat.to)}`));

  const known = new Set(["name", "from", "to"]);
  for (const k of Object.keys(stat))
    if (!known.has(k)) errs.push(ve(`${ctx}.${k}`, `campo inesperado "${k}"`));

  return errs;
}

function validateChange(change: unknown, ctx: string): ValidationError[] {
  if (!isObject(change)) return [ve(ctx, "deve ser um objeto")];
  const errs: ValidationError[] = [];

  if (!isString(change.ability))
    errs.push(ve(`${ctx}.ability`, `esperado string, recebeu ${JSON.stringify(change.ability)}`));
  if (!isString(change.raw_text))
    errs.push(ve(`${ctx}.raw_text`, `esperado string, recebeu ${JSON.stringify(change.raw_text)}`));

  if (!isArray(change.stats))
    errs.push(ve(`${ctx}.stats`, "esperado array"));
  else
    (change.stats as unknown[]).forEach((s, i) =>
      errs.push(...validateStat(s, `${ctx}.stats[${i}]`))
    );

  if (!isArray(change.notes))
    errs.push(ve(`${ctx}.notes`, "esperado array de strings"));
  else
    (change.notes as unknown[]).forEach((n, i) => {
      if (!isString(n))
        errs.push(ve(`${ctx}.notes[${i}]`, `esperado string, recebeu ${JSON.stringify(n)}`));
    });

  const known = new Set(["ability", "raw_text", "stats", "notes"]);
  for (const k of Object.keys(change))
    if (!known.has(k)) errs.push(ve(`${ctx}.${k}`, `campo inesperado "${k}"`));

  return errs;
}

function validateSubsection(sub: unknown, ctx: string): ValidationError[] {
  if (!isObject(sub)) return [ve(ctx, "deve ser um objeto")];
  const errs: ValidationError[] = [];

  if (!isString(sub.heading))
    errs.push(ve(`${ctx}.heading`, `esperado string, recebeu ${JSON.stringify(sub.heading)}`));
  if (!isString(sub.searchable_text))
    errs.push(ve(`${ctx}.searchable_text`, `esperado string, recebeu ${JSON.stringify(sub.searchable_text)}`));

  if (!isArray(sub.changes))
    errs.push(ve(`${ctx}.changes`, "esperado array"));
  else
    (sub.changes as unknown[]).forEach((c, i) =>
      errs.push(...validateChange(c, `${ctx}.changes[${i}]`))
    );

  const known = new Set(["heading", "searchable_text", "changes"]);
  for (const k of Object.keys(sub))
    if (!known.has(k)) errs.push(ve(`${ctx}.${k}`, `campo inesperado "${k}"`));

  return errs;
}

function validateSection(section: unknown, ctx: string): ValidationError[] {
  if (!isObject(section)) return [ve(ctx, "deve ser um objeto")];
  const errs: ValidationError[] = [];

  if (!isString(section.heading))
    errs.push(ve(`${ctx}.heading`, `esperado string, recebeu ${JSON.stringify(section.heading)}`));

  if (!("description" in section))
    errs.push(ve(`${ctx}.description`, "campo ausente — use null se vazio"));
  else if (!isStringOrNull(section.description))
    errs.push(ve(`${ctx}.description`, `esperado string | null, recebeu ${JSON.stringify(section.description)}`));

  if (!isArray(section.items))
    errs.push(ve(`${ctx}.items`, "esperado array de strings"));
  else
    (section.items as unknown[]).forEach((item, i) => {
      if (!isString(item))
        errs.push(ve(`${ctx}.items[${i}]`, `esperado string, recebeu ${JSON.stringify(item)}`));
    });

  if (!isString(section.searchable_text))
    errs.push(ve(`${ctx}.searchable_text`, `esperado string, recebeu ${JSON.stringify(section.searchable_text)}`));

  if (!isArray(section.subsections))
    errs.push(ve(`${ctx}.subsections`, "esperado array"));
  else
    (section.subsections as unknown[]).forEach((sub, i) =>
      errs.push(...validateSubsection(sub, `${ctx}.subsections[${i}]`))
    );

  const known = new Set(["heading", "description", "items", "searchable_text", "subsections"]);
  for (const k of Object.keys(section))
    if (!known.has(k)) errs.push(ve(`${ctx}.${k}`, `campo inesperado "${k}"`));

  return errs;
}

function validatePatchNote(patch: unknown, ctx: string): ValidationError[] {
  if (!isObject(patch)) return [ve(ctx, "deve ser um objeto")];
  const errs: ValidationError[] = [];

  // Campos string obrigatórios
  const required = [
    "slug", "game_update", "patch_name", "version",
    "date", "date_iso", "description", "source_url",
  ] as const;

  for (const key of required) {
    if (!(key in patch))
      errs.push(ve(`${ctx}.${key}`, "campo obrigatório ausente"));
    else if (!isString(patch[key]))
      errs.push(ve(`${ctx}.${key}`, `esperado string, recebeu ${JSON.stringify(patch[key])}`));
  }

  // revision: string | null
  if (!("revision" in patch))
    errs.push(ve(`${ctx}.revision`, "campo ausente — use null se não há revisão"));
  else if (!isStringOrNull(patch.revision))
    errs.push(ve(`${ctx}.revision`, `esperado string | null, recebeu ${JSON.stringify(patch.revision)}`));

  // date_iso: YYYY-MM-DD
  if (isString(patch.date_iso) && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date_iso))
    errs.push(ve(`${ctx}.date_iso`, `formato inválido "${patch.date_iso}" — esperado YYYY-MM-DD`));

  // keywords: string[]
  if (!isArray(patch.keywords))
    errs.push(ve(`${ctx}.keywords`, "esperado array de strings"));
  else
    (patch.keywords as unknown[]).forEach((k, i) => {
      if (!isString(k))
        errs.push(ve(`${ctx}.keywords[${i}]`, `esperado string, recebeu ${JSON.stringify(k)}`));
    });

  // sections
  if (!isArray(patch.sections)) {
    errs.push(ve(`${ctx}.sections`, "esperado array"));
  } else {
    if ((patch.sections as unknown[]).length === 0)
      errs.push(ve(`${ctx}.sections`, "array vazio — pelo menos uma section é esperada"));
    (patch.sections as unknown[]).forEach((sec, i) =>
      errs.push(...validateSection(sec, `${ctx}.sections[${i}]`))
    );
  }

  const known = new Set([
    "slug", "game_update", "patch_name", "version", "revision",
    "date", "date_iso", "description", "keywords", "source_url", "sections",
  ]);
  for (const k of Object.keys(patch))
    if (!known.has(k)) errs.push(ve(`${ctx}.${k}`, `campo inesperado "${k}"`));

  return errs;
}

// ─── Validar arquivo ─────────────────────────────────────────────────────────

interface FileResult {
  file: string;
  count: number;
  errors: ValidationError[];
}

function validateFile(filePath: string): FileResult {
  const fileName = path.basename(filePath);

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return { file: fileName, count: 0, errors: [ve(fileName, `erro ao ler: ${err}`)] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { file: fileName, count: 0, errors: [ve(fileName, `JSON inválido: ${err}`)] };
  }

  const errors: ValidationError[] = [];

  if (isArray(parsed)) {
    (parsed as unknown[]).forEach((item, i) =>
      errors.push(...validatePatchNote(item, `[${i}]`))
    );
    return { file: fileName, count: (parsed as unknown[]).length, errors };
  }

  if (isObject(parsed)) {
    errors.push(...validatePatchNote(parsed, "[0]"));
    return { file: fileName, count: 1, errors };
  }

  return {
    file: fileName,
    count: 0,
    errors: [ve(fileName, "raiz deve ser um objeto PatchNote ou array de PatchNotes")],
  };
}

// ─── Sugestões de fix ─────────────────────────────────────────────────────────

function getSuggestion(fieldPath: string): string | null {
  if (fieldPath.endsWith(".revision"))          return '"revision": null';
  if (fieldPath.endsWith(".description"))       return '"description": null';
  if (fieldPath.endsWith(".items"))             return '"items": []';
  if (fieldPath.endsWith(".subsections"))       return '"subsections": []';
  if (fieldPath.endsWith(".changes"))           return '"changes": []';
  if (fieldPath.endsWith(".stats"))             return '"stats": []';
  if (fieldPath.endsWith(".notes"))             return '"notes": []';
  if (fieldPath.endsWith(".keywords"))          return '"keywords": []';
  if (fieldPath.endsWith(".searchable_text"))   return '"searchable_text": ""';
  if (fieldPath.endsWith(".date_iso"))          return '"date_iso": "YYYY-MM-DD"';
  return null;
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

  console.log(col(C.bold, `\n🔍 Validando ${files.length} arquivo(s) em ${PATCHES_DIR}\n`));

  const results: FileResult[] = files.map((f) =>
    validateFile(path.join(PATCHES_DIR, f))
  );

  const ok  = results.filter((r) => r.errors.length === 0);
  const bad = results.filter((r) => r.errors.length > 0);

  // Arquivos com erro
  if (bad.length > 0) {
    console.log(col(C.bold + C.red, `✗ ${bad.length} arquivo(s) com problemas:\n`));
    for (const r of bad) {
      console.log(col(C.bold, `  📄 ${r.file}`) + col(C.gray, `  (${r.count} patch(es))`));
      for (const err of r.errors) {
        const pathStr = col(C.cyan, err.path.padEnd(55));
        const msgStr  = col(C.red,  err.message);
        console.log(`     ${pathStr} ${msgStr}`);
        if (FIX) {
          const sug = getSuggestion(err.path);
          if (sug) console.log(col(C.gray, `     ${"".padEnd(55)} ↳ sugestão: ${sug}`));
        }
      }
      console.log();
    }
  }

  // Arquivos OK (apenas em --verbose)
  if (VERBOSE && ok.length > 0) {
    console.log(col(C.bold + C.green, `✓ ${ok.length} arquivo(s) válidos:\n`));
    for (const r of ok) {
      const label = r.count === 1 ? "1 patch" : `${r.count} patches`;
      console.log(`  ${col(C.green, "✓")} ${r.file} ${col(C.gray, `(${label})`)}`);
    }
    console.log();
  }

  // Sumário
  const totalPatches = results.reduce((acc, r) => acc + r.count, 0);
  const totalErrors  = results.reduce((acc, r) => acc + r.errors.length, 0);

  console.log(col(C.bold, "─".repeat(65)));
  console.log(
    `  Arquivos : ${files.length}  |  ` +
    col(C.green, `OK: ${ok.length}`) + "  |  " +
    (bad.length > 0 ? col(C.red, `Erros: ${bad.length}`) : col(C.green, "Erros: 0"))
  );
  console.log(`  PatchNotes lidos : ${totalPatches}`);
  console.log(`  Problemas totais : ${totalErrors}`);
  console.log(col(C.bold, "─".repeat(65)));

  if (bad.length === 0) {
    console.log(col(C.green + C.bold, "\n✓ Todos os arquivos estão no formato esperado.\n"));
  } else {
    if (!VERBOSE) console.log(col(C.gray, "\n  Dica: --verbose mostra também os arquivos OK."));
    if (!FIX)     console.log(col(C.gray, "  Dica: --fix exibe sugestão de valor para campos ausentes.\n"));
    process.exit(1);
  }
}

main();