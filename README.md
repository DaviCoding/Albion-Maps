# Albion Maps — Patch Notes

Pipeline completo de ingestão, validação e seed dos patch notes do Albion Online no banco de dados.

---

## Estrutura do projeto

```
prisma/
  seed/
    index.ts          ← seed principal
    patches/          ← um .json por patch
scripts/
  validate-patches.ts ← valida o formato dos JSONs
  fix-patches.ts      ← corrige problemas automáticos
src/
  services/
    patches/
      service.ts      ← getAllPatches, getPatchBySlug
      types.ts        ← PatchSummary, PatchDetail, SectionDetail, etc.
    search/
      service.ts      ← searchChanges
      types.ts        ← SearchResult, ChangeResult, SectionResult, SubsectionResult
```

---

## Formato dos JSONs

Cada arquivo em `prisma/seed/patches/` representa um patch note e segue este schema:

```json
{
  "slug": "queen-patch-8",
  "game_update": "Queen",
  "patch_name": "Queen Patch 8",
  "version": "1.16.393",
  "revision": "162877",
  "date": "25 March 2020",
  "date_iso": "2020-03-25",
  "description": "Queen Patch 8 (25 March 2020) — Gathering Changes, Combat Balance Changes, Fixes.",
  "keywords": ["daggers", "frost staffs", "swords"],
  "source_url": "https://forum.albiononline.com/...",
  "sections": [
    {
      "heading": "Combat Balance Changes",
      "description": null,
      "items": [],
      "searchable_text": "...",
      "subsections": [
        {
          "heading": "Daggers",
          "searchable_text": "...",
          "changes": [
            {
              "ability": "Dash:",
              "raw_text": "Dash: Cooldown: 10s → 20s Range: 11m → 8m",
              "stats": [
                { "name": "Cooldown", "from": "10s", "to": "20s" },
                { "name": "Range",    "from": "11m", "to": "8m"  }
              ],
              "notes": ["Texto livre sem valor numérico"]
            }
          ]
        }
      ]
    },
    {
      "heading": "Fixes",
      "description": null,
      "items": [
        { "text": "Fixed issue where some mobs' spell VFX..." },
        {
          "text": "Avalonian Crystal Basilisk",
          "subitems": [
            { "text": "Health reduced by 35%" },
            { "text": "Auto-attack damage reduced by 26%" }
          ]
        }
      ],
      "searchable_text": "...",
      "subsections": [
        {
          "heading": "Spell Fixes",
          "searchable_text": "...",
          "items": [
            { "text": "Fixed issue where Fury (Soldier Armor) description was incorrect" }
          ]
        }
      ]
    }
  ]
}
```

### Hierarquia

```
PatchNote
├── slug, game_update, patch_name, version?, revision?
├── date, date_iso, description, keywords, source_url
└── sections[]
    ├── heading
    ├── description?        ← texto livre opcional (null se vazio)
    ├── items[]             ← objetos { text, stats?, subitems? }
    ├── searchable_text     ← texto concatenado para indexação
    └── subsections[]
        ├── heading
        ├── description?
        ├── searchable_text
        ├── changes[]       ← presente em subsections de combat balance
        │   ├── ability
        │   ├── raw_text
        │   ├── stats[]     ← { name, from, to }
        │   └── notes[]
        └── items[]         ← presente em subsections gerais (Fixes, Faction Warfare, etc.)
            └── { text, stats?, subitems? }
```

### Regras dos campos

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `slug` | `string` | ✓ | único por patch |
| `version` | `string \| null` | ✓ | `null` em hotfixes sem versão |
| `revision` | `string \| null` | ✓ | `null` se não houver |
| `date_iso` | `string` | ✓ | formato `YYYY-MM-DD` |
| `description` (section) | `string \| null` | ✓ | `null` se vazio |
| `items` | `ItemJson[]` | ✓ | `[]` se vazio — objetos, não strings planas |
| `subsections` | `array` | ✓ | `[]` se vazio |
| `changes` | `array` | — | apenas em subsections de combat balance |
| `stats` | `array` | ✓ | `[]` se sem valores mensuráveis |
| `notes` | `string[]` | ✓ | `[]` se vazio |

> **`items` é sempre um array de objetos**, nunca strings.
> Cada item tem ao menos `text: string`, e opcionalmente `stats[]` e `subitems[]`.

---

## Fluxo de trabalho

### 1. Validar os arquivos

```bash
bun run scripts/validate-patches.ts           # apenas erros
bun run scripts/validate-patches.ts --verbose # erros + arquivos OK
bun run scripts/validate-patches.ts --fix     # erros + sugestão de valor
```

### 2. Corrigir problemas automáticos

Padrões corrigidos automaticamente:

- `version: null` → mantido como `null` (válido)
- `ability/raw_text: null` → `""`
- `stats[].name/from/to: null` → `""`
- `items[]` com string plana → `{ text: string }` (migração)
- `subsections`, `items`, `stats`, `notes` ausentes → `[]`
- `description` ausente → `null`
- `searchable_text` ausente → `""`

```bash
bun run scripts/fix-patches.ts              # dry-run
bun run scripts/fix-patches.ts --verbose    # detalha campo por campo
bun run scripts/fix-patches.ts --write      # aplica as correções
```

Confirme após aplicar:

```bash
bun run scripts/validate-patches.ts
```

### 3. Popular o banco

```bash
bun run prisma/seed/index.ts                          # seed normal (idempotente)
bun run prisma/seed/index.ts --reset                  # limpa e refaz tudo
bun run prisma/seed/index.ts --file=realm-divided-patch-5.json  # arquivo único
```

---

## Busca

A função `searchChanges` cobre os três níveis do banco:

| Tipo | O que retorna | Exemplo de query |
|---|---|---|
| `change` | Mudança atômica de habilidade | `"multishot"`, `"cooldown"` |
| `section` | Seção de topo com items | `"fame buff"`, `"gathering"` |
| `subsection` | Subseção com items | `"spell fixes"`, `"faction enlistment"` |

```ts
// Busca em tudo
searchChanges("fame buff")

// Só combat balance
searchChanges("multishot", 1, { kind: "change" })

// Filtrado por update e data
searchChanges("cooldown", 1, {
  kind: "change",
  gameUpdate: "realm-divided",
  dateFrom: "2026-01-01",
})
```

M�ltiplos termos com `/` funcionam como AND:

```ts
searchChanges("bows / cooldown")  // deve conter "bows" E "cooldown"
```

---

## Ambiente

```bash
docker compose up -d          # Postgres + pgAdmin + app
docker compose down           # para (preserva dados)
docker compose down -v        # para e apaga volumes
```

```
pgAdmin: http://localhost:5050
App:     http://localhost:3000
```

Copie `.env.example` para `.env` antes de subir.

---

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `bun run dev` | Servidor em modo watch |
| `bun run validate` | Valida todos os JSONs |
| `bun run seed` | Roda o seed |
| `bun run scripts/fix-patches.ts --write` | Corrige problemas automáticos |