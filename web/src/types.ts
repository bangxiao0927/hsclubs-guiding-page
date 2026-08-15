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
  /** A fixture for exercising this UI, not an approved participating school. */
  demo: boolean
  /** Operator-confirmed coordinates, or null when none have been recorded. */
  location: { lat: number; lon: number } | null
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
  history: { at: string; clubCount: number }[]
  /** Net change over the stored window, or null when there is nothing to compare. */
  trend: number | null
  lastPolledAt: string | null
  lastError: string | null
}

export interface PagePayload {
  title: string
  generatedAt: string
  totals: { schools: number; clubs: number; checkedAge: string }
  schools: School[]
}

export interface StatusPayload {
  generatedAt: string
  state: 'healthy' | 'degraded' | 'waiting'
  summary: string
  schools: {
    slug: string
    state: 'healthy' | 'failing' | 'waiting'
    checkedAge: string
    failureStreak: number
    error: string | null
  }[]
  alerts: {
    slug: string
    kind: 'failing' | 'recovered'
    streak: number
    error: string | null
    at: string
  }[]
}
