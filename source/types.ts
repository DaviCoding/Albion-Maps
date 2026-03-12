export interface GameUpdate {
    name: string
    slug: string
    date: string
    thumbnail: string | null
}

export interface Changelog {
    title: string
    slug: string
    date: string
    url: string
}

export interface GameUpdateWithChangelogs extends GameUpdate {
    changelogs: Changelog[]
}