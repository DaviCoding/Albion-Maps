// ── Item recursivo (sections e subsections gerais) ────────────────
export interface ItemJson {
    text: string;
    stats?: { name: string; from: string; to: string }[];
    subitems?: ItemJson[];
}

// ── Base comum a todos os resultados ─────────────────────────────
interface BaseResult {
    patchSlug: string;
    patchVersion: string | null;
    patchDate: Date;
    patchName: string;
    gameUpdateName: string;
    gameUpdateSlug: string;
    sectionHeading: string;
    subsectionHeading: string | null;
}

// ── Combat balance: mudança atômica de habilidade ─────────────────
export interface ChangeResult extends BaseResult {
    kind: "change";
    id: number;
    ability: string;
    rawText: string;
    notes: string[];
    stats: { name: string; from: string; to: string }[];
}

// ── Seção com items (patch geral, conteúdo de topo) ───────────────
export interface SectionResult extends BaseResult {
    kind: "section";
    id: number;
    description: string | null;
    items: ItemJson[];
}

// ── Subseção com items (Faction Warfare, Fixes, etc.) ────────────
export interface SubsectionResult extends BaseResult {
    kind: "subsection";
    id: number;
    description: string | null;
    items: ItemJson[];
}

export type SearchResult = ChangeResult | SectionResult | SubsectionResult;

// ── Meta da paginação ─────────────────────────────────────────────
export interface SearchMeta {
    query: string;
    terms: string[];
    total: number;
    page: number;
    totalPages: number;
    perPage: number;
    filters: {
        kind: "all" | "change" | "section" | "subsection";
        dateFrom?: string;
        dateTo?: string;
        gameUpdate?: string;
    };
    counts: {
        changes: number;
        sections: number;
        subsections: number;
    };
}