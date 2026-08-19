import { fetchSummary, type FetchOptions } from './fetchSummary.js'
import type { SchoolEntry } from './registry.js'
import type { HistoryPoint, SchoolRecord } from './store.js'

export type PollOutcome = 'updated' | 'not-modified' | 'failed'

export interface PollResult {
  outcome: PollOutcome
  record: SchoolRecord
}

/**
 * Polls one school and returns the record to store. Pure with respect to the store, so the
 * decision of what to remember is testable without touching the disk.
 *
 * A failure never discards the last good summary: a school that is down should show as stale
 * with a reason, not vanish from the page.
 */
/** Kept for a month, and only when the number moved: an unchanged school answers 304 nearly
 *  every hour, and a point per poll would be 700 identical entries a month per school. */
const HISTORY_DAYS = 30

const appendHistory = (
  previous: HistoryPoint[],
  at: string,
  clubCount: number,
): HistoryPoint[] => {
  const last = previous[previous.length - 1]
  const points = last?.clubCount === clubCount ? previous : [...previous, { at, clubCount }]
  const cutoff = Date.parse(at) - HISTORY_DAYS * 24 * 60 * 60 * 1000
  // Always keep the last point before the window, or a school that has not changed in a month
  // would have no line to draw at all.
  const firstInside = points.findIndex((point) => Date.parse(point.at) >= cutoff)
  return firstInside <= 0 ? points : points.slice(firstInside - 1)
}

export const pollSchool = async (
  entry: SchoolEntry,
  previous: SchoolRecord,
  options: FetchOptions & { now?: () => Date } = {},
): Promise<PollResult> => {
  const now = (options.now ?? (() => new Date()))().toISOString()

  try {
    const result = await fetchSummary(entry.summaryUrl, entry.slug, {
      ...options,
      etag: previous.etag,
      // The hourly poll checks identity too, not just the monthly verification pass. Otherwise a
      // school that started serving another school's summary would have its numbers stored, and
      // shown, for up to a month before anything noticed.
      ...(entry.schoolId !== undefined ? { expectedSchoolId: entry.schoolId } : {}),
    })

    if (result.outcome === 'not-modified') {
      return {
        outcome: 'not-modified',
        record: {
          ...previous,
          slug: entry.slug,
          lastPolledAt: now,
          lastError: null,
          failureStreak: 0,
        },
      }
    }

    return {
      outcome: 'updated',
      record: {
        slug: entry.slug,
        summary: result.summary,
        etag: result.etag,
        lastPolledAt: now,
        lastUpdatedAt: now,
        lastError: null,
        failureStreak: 0,
        history: appendHistory(previous.history, now, result.summary.clubCount),
      },
    }
  } catch (error) {
    return {
      outcome: 'failed',
      record: {
        ...previous,
        slug: entry.slug,
        lastPolledAt: now,
        lastError: describe(error),
        // Counted, not flagged: one failed poll is a school restarting. What to do about a run
        // of them is a decision for the alerting, not for this function.
        failureStreak: previous.failureStreak + 1,
      },
    }
  }
}

/**
 * Node's fetch reports every transport problem as "fetch failed" and hides the real reason in
 * `cause`. That message is what the operator sees on a stale card, so unwrap it: "getaddrinfo
 * ENOTFOUND" and "certificate has expired" call for very different fixes.
 */
const describe = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    return `${error.message}: ${cause.message}`
  }
  return error.message
}
