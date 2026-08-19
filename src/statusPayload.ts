import type { StoredAlert } from './alertLog.js'
import type { RouteUsage, UsageRoute } from './legacyUsage.js'
import { describeAge } from './renderPage.js'
import type { SchoolRecord } from './store.js'

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
  alerts: StoredAlert[]
  /** Read counts for the versioned and unversioned directory endpoints; no user data. */
  usage?: Record<UsageRoute, RouteUsage>
}

/**
 * Operational truth for /status, intentionally independent of registry visibility.
 *
 * A school is degraded on its first failure even though notifications wait for three: the page
 * should tell the truth immediately; the webhook waits because waking someone is a different
 * decision from displaying state.
 */
export const buildStatusPayload = (
  records: SchoolRecord[],
  alerts: StoredAlert[],
  now = new Date(),
  usage?: Record<UsageRoute, RouteUsage>,
): StatusPayload => {
  const schools = records.map((record) => ({
    slug: record.slug,
    state: (record.lastPolledAt === null
      ? 'waiting'
      : record.failureStreak > 0
        ? 'failing'
        : 'healthy') as 'healthy' | 'failing' | 'waiting',
    checkedAge: describeAge(record.lastPolledAt, now),
    failureStreak: record.failureStreak,
    error: record.lastError,
  }))
  const failing = schools.filter((school) => school.state === 'failing').length
  const waiting = schools.filter((school) => school.state === 'waiting').length
  return {
    generatedAt: now.toISOString(),
    state: failing > 0 ? 'degraded' : schools.length === 0 || waiting === schools.length ? 'waiting' : 'healthy',
    summary:
      failing > 0
        ? `${failing} school${failing === 1 ? '' : 's'} failing`
        : waiting > 0
          ? `${waiting} school${waiting === 1 ? '' : 's'} waiting for its first poll`
          : `All ${schools.length} schools answering`,
    schools,
    alerts: alerts.slice(0, 50),
    ...(usage ? { usage } : {}),
  }
}
