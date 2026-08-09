import type { FetchOptions } from './fetchSummary.js'
import { pollSchool, type PollOutcome } from './pollSchool.js'
import type { SchoolEntry } from './registry.js'
import type { SchoolStore } from './store.js'

export interface SchoolPollReport {
  slug: string
  outcome: PollOutcome
  error: string | null
}

export interface PollPassReport {
  startedAt: string
  schools: SchoolPollReport[]
  updated: number
  unchanged: number
  failed: number
}

export interface PollAllOptions extends FetchOptions {
  now?: () => Date
  onSchool?: (report: SchoolPollReport) => void
}

/**
 * One pass over every school the registry says to poll.
 *
 * Sequential on purpose: a handful of schools on one machine (docs/ROADMAP.md), and polling them
 * one at a time means a slow school delays the pass rather than competing for the same sockets
 * and timeouts as the others.
 *
 * Each school is stored as soon as it is polled, not at the end. A pass interrupted halfway --
 * the machine sleeping, the process being stopped -- keeps what it already learned.
 */
export const pollAllSchools = async (
  entries: SchoolEntry[],
  store: SchoolStore,
  options: PollAllOptions = {},
): Promise<PollPassReport> => {
  const startedAt = (options.now ?? (() => new Date()))().toISOString()
  const schools: SchoolPollReport[] = []

  for (const entry of entries) {
    const { outcome, record } = await pollSchool(entry, store.get(entry.slug), options)
    // Storing per school, and never letting one school's write failure end the pass: the point
    // of this loop is that schools are independent.
    try {
      await store.put(record)
    } catch (error) {
      schools.push({
        slug: entry.slug,
        outcome: 'failed',
        error: `Could not store the result: ${error instanceof Error ? error.message : String(error)}`,
      })
      options.onSchool?.(schools[schools.length - 1]!)
      continue
    }

    const report: SchoolPollReport = { slug: entry.slug, outcome, error: record.lastError }
    schools.push(report)
    options.onSchool?.(report)
  }

  return {
    startedAt,
    schools,
    updated: schools.filter((school) => school.outcome === 'updated').length,
    unchanged: schools.filter((school) => school.outcome === 'not-modified').length,
    failed: schools.filter((school) => school.outcome === 'failed').length,
  }
}
