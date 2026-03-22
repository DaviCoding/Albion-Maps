interface StatJson { name: string; from: string; to: string; }
interface ChangeJson { ability: string; raw_text: string; stats: StatJson[]; notes: string[]; }
interface SubsectionJson { heading: string; searchable_text: string; changes: ChangeJson[]; }
interface SectionJson { heading: string; description: string | null; items: string[]; searchable_text: string; subsections: SubsectionJson[]; }
export interface PatchNoteJson {
    slug: string; game_update: string; patch_name: string; version: string;
    revision: string | null; date: string; date_iso: string; description: string;
    keywords: string[]; source_url: string; sections: SectionJson[];
}