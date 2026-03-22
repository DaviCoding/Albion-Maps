import type { ItemJson } from "../search/types";

// ── Patch listing (getAllPatches) ─────────────────────────────────

export interface PatchSummary {
    id: number;
    slug: string;
    patchName: string;
    version: string | null;
    date: string;
    dateIso: Date;
    description: string;
    keywords: string[];
    gameUpdate: { slug: string; name: string };
}

// ── Patch detail (getPatchBySlug) ─────────────────────────────────

export interface StatDetail {
    id: number;
    name: string;
    from: string;
    to: string;
}

export interface ChangeDetail {
    id: number;
    ability: string;
    rawText: string;
    notes: string[];
    stats: StatDetail[];
}

/** Subseção polimórfica:
 *  - Combat balance → tem `changes`, não tem `items`
 *  - Geral (Fixes, Faction Warfare, etc.) → tem `items`, não tem `changes`
 */
export interface SubsectionDetail {
    id: number;
    heading: string;
    description: string | null;
    searchText: string;
    changes: ChangeDetail[];
    items: ItemJson[] | undefined;
}

export interface SectionDetail {
    id: number;
    heading: string;
    description: string | null;
    items: ItemJson[];
    searchText: string;
    subsections: SubsectionDetail[];
}

export interface PatchDetail {
    id: number;
    slug: string;
    patchName: string;
    version: string | null;
    revision: string | null;
    date: string;
    dateIso: Date;
    description: string;
    keywords: string[];
    sourceUrl: string;
    gameUpdate: { slug: string; name: string };
    sections: SectionDetail[];
}