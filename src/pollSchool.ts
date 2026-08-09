import { fetchSummary, type FetchOptions } from './fetchSummary.js'
import type { SchoolEntry } from './registry.js'
import type { SchoolRecord } from './store.js'

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
    })

    if (result.outcome === 'not-modified') {
      return {
        outcome: 'not-modified',
        record: { ...previous, slug: entry.slug, lastPolledAt: now, lastError: null },
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
