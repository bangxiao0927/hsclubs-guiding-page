/** Mirrors src/pagePayload.ts on the server. One shape, two type declarations, no adapter. */
export type SchoolStatus = 'live' | 'stale' | 'no-data'

export interface Category {
  name: string
  count: number
}

export interface School {
  slug: string
  siteUrl: string
  host: string
  status: SchoolStatus
  schoolName: string | null
  address: string | null
  clubCount: number | null
  categories: Category[]
  /** When the school says its clubs last changed. */
  publishedAge: string
  /** When this page last saw that summary change. */
  changedAge: string
  /** When this page last asked. */
  checkedAge: string
  publishedAt: string | null
  lastUpdatedAt: string | null
  lastPolledAt: string | null
  lastError: string | null
}

export interface PagePayload {
  title: string
  generatedAt: string
  totals: { schools: number; clubs: number; checkedAge: string }
  schools: School[]
}