import { describeAge, isStale } from './renderPage.js'
import type { PageSchool } from './pageData.js'

/**
 * The page's data as JSON, for the browser app in web/ to render.
 *
 * The same values the server-rendered fallback shows, shaped once here so the two can never
 * drift into telling a visitor different things. Freshness is computed on the server on
 * purpose: a client clock that is wrong -- or a tab left open overnight -- would otherwise
 * decide on its own what counts as stale.
 */
export type SchoolStatus = 'live' | 'stale' | 'no-data'

export interface SchoolPayload {
  slug: string
  siteUrl: string
  host: string
  status: SchoolStatus
  schoolName: string | null
  address: string | null
  clubCount: number | null
  categories: { name: string; count: number }[]
  /**
   * Human "3 hours ago", already resolved against the server's clock.
   *
   * Three questions with three different owners, kept apart: `publishedAge` is when the school
   * says its clubs last changed, `changedAge` is when this page last saw that summary change,
   * and `checkedAge` is when it last asked. Collapsing them is how a page ends up claiming a
   * directory changed when only the poller did.
   */
  publishedAge: string
  changedAge: string
  checkedAge: string
  publishedAt: string | null
  lastUpdatedAt: string | null
  /** Club counts over the last month, oldest first. Empty until a school changes twice. */
  history: { at: string; clubCount: number }[]
  /** Net change over that window, or null when there is nothing to compare. */
  trend: number | null
  lastPolledAt: string | null
  lastError: string | null
}

export interface PagePayload {
  title: string
  generatedAt: string
  totals: { schools: number; clubs: number; checkedAge: string }
  schools: SchoolPayload[]
}

export interface PayloadOptions {
  title?: string
  now?: Date
  staleAfterMs?: number
}

const hostOf = (siteUrl: string): string => {
  try {
    return new URL(siteUrl).host
  } catch {
    return siteUrl
  }
}

export const buildPayload = (
  schools: PageSchool[],
  { title = 'HS Clubs', now = new Date(), staleAfterMs }: PayloadOptions = {},
): PagePayload => {
  const list = schools.map(({ record, siteUrl }): SchoolPayload => {
    const summary = record.summary
    const stale = isStale(record, now, staleAfterMs)
    return {
      slug: record.slug,
      siteUrl,
      host: hostOf(siteUrl),
      status: !summary ? 'no-data' : stale ? 'stale' : 'live',
      schoolName: summary?.schoolName ?? null,
      address: summary?.address ?? null,
      clubCount: summary?.clubCount ?? null,
      categories: Object.entries(summary?.categories ?? {})
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      publishedAge: describeAge(summary?.lastUpdatedAt ?? null, now),
      changedAge: describeAge(record.lastUpdatedAt, now),
      checkedAge: describeAge(record.lastPolledAt, now),
      publishedAt: summary?.lastUpdatedAt ?? null,
      lastUpdatedAt: record.lastUpdatedAt,
      history: record.history,
      // Only from the window we actually have: two points a month apart is a trend, one point
      // is a number, and pretending the difference from zero is a trend would show every new
      // school as a spike.
      trend:
        record.history.length >= 2
          ? (record.history[record.history.length - 1]?.clubCount ?? 0) -
            (record.history[0]?.clubCount ?? 0)
          : null,
      lastPolledAt: record.lastPolledAt,
      lastError: record.lastError,
    }
  })

  // The freshest successful read, because a visitor asking "is this page alive?" is asking
  // about the poller, not about any one school.
  const polled = list
    .map((school) => Date.parse(school.lastPolledAt ?? ''))
    .filter((value) => !Number.isNaN(value))

  return {
    title,
    generatedAt: now.toISOString(),
    totals: {
      schools: list.length,
      clubs: list.reduce((total, school) => total + (school.clubCount ?? 0), 0),
      checkedAge: describeAge(
        polled.length > 0 ? new Date(Math.max(...polled)).toISOString() : null,
        now,
      ),
    },
    schools: list,
  }
}