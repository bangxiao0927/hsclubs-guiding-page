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
  updatedAge: string
  checkedAge: string
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