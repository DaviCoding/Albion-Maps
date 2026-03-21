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
      "description": "Texto livre opcional entre o heading e os itens",
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
        "Fixed issue where...",
        "Fixed issue where..."
      ],
      "searchable_text": "...",
      "subsections": []
    }
  ]
}
```

### Hierarquia

```
PatchNote
├── slug, game_update, patch_name, version, revision
├── date, date_iso, description, keywords, source_url
└── sections[]
    ├── heading
    ├── description?        ← texto livre entre o heading e as listas (null se vazio)
    ├── items[]             ← bullets sem subsection (ex: seção "Fixes")
    ├── searchable_text     ← texto concatenado para indexação
    └── subsections[]
        ├── heading
        ├── searchable_text
        └── changes[]
            ├── ability     ← nome da habilidade alterada
            ├── raw_text    ← texto completo da mudança
            ├── stats[]     ← { name, from, to } — apenas valores numéricos/mensuráveis
            └── notes[]     ← linhas sem formato "A → B"
```

### Regras importantes

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `slug` | `string` | ✓ | único por patch |
| `version` | `string` | ✓ | `""` para hotfixes sem versão |
| `revision` | `string \| null` | ✓ | `null` se não houver |
| `date_iso` | `string` | ✓ | formato `YYYY-MM-DD` |
| `description` | `string \| null` | ✓ | `null` se vazio (em sections) |
| `items` | `string[]` | ✓ | `[]` se vazio |
| `subsections` | `array` | ✓ | `[]` se vazio |
| `stats` | `array` | ✓ | `[]` se sem valores numéricos |
| `notes` | `string[]` | ✓ | `[]` se vazio |

---

## Fluxo de trabalho

### 1. Validar os arquivos

Verifica se todos os JSONs em `prisma/seed/patches/` estão no formato esperado.

```bash
# Mostra apenas os erros
bun run scripts/validate-patches.ts

# Mostra erros + arquivos OK
bun run scripts/validate-patches.ts --verbose

# Mostra erros + sugestão de valor para campos ausentes
bun run scripts/validate-patches.ts --fix
```

### 2. Corrigir problemas automáticos

Corrige os padrões mais comuns sem precisar editar manualmente:

- `version: null` → `""`
- `ability: null` → `""`
- `stats[].from / .to: null` → `""`
- Formato antigo com campo `meta` → migra para a raiz
- `subsections`, `items`, `stats`, `notes` ausentes → `[]`
- `description` ausente → `null`

```bash
# Dry-run — mostra o que seria corrigido sem alterar nada
bun run scripts/fix-patches.ts

# Detalha campo por campo
bun run scripts/fix-patches.ts --verbose

# Aplica as correções
bun run scripts/fix-patches.ts --write
```

Após o `--write`, rode o validador novamente para confirmar:

```bash
bun run scripts/validate-patches.ts
```

### 3. Popular o banco

```bash
# Seed normal — idempotente, pula patches já existentes
bun run prisma/seed/index.ts

# Limpa o banco inteiro e refaz tudo do zero
bun run prisma/seed/index.ts --reset

# Seed de um único arquivo — útil para testar
bun run prisma/seed/index.ts --file=realm-divided-patch-5.json
```

---

## Ambiente

```bash
# Subir Postgres + pgAdmin + app
docker compose up -d

# pgAdmin: http://localhost:5050
# App:     http://localhost:3000

# Derrubar (preserva os dados)
docker compose down

# Derrubar e apagar tudo (volumes incluídos)
docker compose down -v
```

Copie `.env.example` para `.env` e preencha as senhas antes de subir.

---

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `bun run dev` | Inicia o servidor em modo watch |
| `bun run validate` | Valida todos os JSONs de patches |
| `bun run seed` | Roda o seed no banco |
| `bun run scripts/fix-patches.ts --write` | Corrige problemas automáticos |