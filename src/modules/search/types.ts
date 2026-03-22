export type ResultKind = "change" | "section";

interface BaseResult {
    kind: ResultKind;
    patchSlug: string;
    patchVersion: string;
    patchDate: Date;
    gameUpdateName: string;
    gameUpdateSlug: string;
    patchName: string;
    sectionHeading: string;
    subsectionHeading: string | null;
}

export interface ChangeResult extends BaseResult {
    kind: "change";
    id: number;
    ability: string;
    rawText: string;
    notes: string[];
    stats: { name: string; from: string; to: string }[];
}

export interface SectionResult extends BaseResult {
    kind: "section";
    id: number;
    description: string | null;
    items: string[];
}

export type SearchResult = ChangeResult | SectionResult;

export interface SearchMeta {
    query: string;
    terms: string[];
    total: number;
    page: number;
    totalPages: number;
    perPage: number;
    filters: {
        kind: "all" | "change" | "section";
        dateFrom?: string;
        dateTo?: string;
        gameUpdate?: string;
    };
    counts: {
        changes: number;
        sections: number;
    };
}