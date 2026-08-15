import type { SchoolRecord } from './store.js'

/**
 * Turning a pass over every school into the few sentences worth waking someone for.
 *
 * The rule is that an alert fires on a *transition*, never on a state. A school that has been
 * down for a week is not news every hour, and an operator who gets an hourly reminder of a
 * problem they already know about learns to filter the whole channel -- which is how the one
 * alert that mattered gets missed.
 */
export interface AlertEvent {
  slug: string
  kind: 'failing' | 'recovered'
  streak: number
  error: string | null
}

export interface AlertOptions {
  /** Consecutive failed polls before a school is worth reporting. */
  threshold?: number
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const DEFAULT_THRESHOLD = 3
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * @param before records as they were at the start of the pass, by slug
 * @param after records as the pass left them
 */
export const alertsFor = (
  before: Map<string, SchoolRecord>,
  after: SchoolRecord[],
  threshold = DEFAULT_THRESHOLD,
): AlertEvent[] =>
  after.flatMap((record): AlertEvent[] => {
    const was = before.get(record.slug)?.failureStreak ?? 0
    const now = record.failureStreak

    // Crossing the threshold, exactly once. A pass that fails twice in a row at threshold 3
    // says nothing; the third says it once; the fourth says nothing again.
    if (now >= threshold && was < threshold) {
      return [{ slug: record.slug, kind: 'failing' as const, streak: now, error: record.lastError }]
    }
    // Recovery is only interesting if the failure was reported in the first place.
    if (now === 0 && was >= threshold) {
      return [{ slug: record.slug, kind: 'recovered' as const, streak: 0, error: null }]
    }
    return []
  })

export const describeAlert = ({ slug, kind, streak, error }: AlertEvent): string =>
  kind === 'failing'
    ? `${slug} has failed ${streak} polls in a row: ${error ?? 'unknown error'}`
    : `${slug} is answering again`

/**
 * Posts the events to a webhook, if one is configured.
 *
 * Never throws: an unreachable alerting endpoint must not end the watch loop or fail a pass.
 * The whole point of this job is that it keeps polling; losing the notification is a smaller
 * failure than losing the poller.
 */
export const sendAlerts = async (
  webhook: string,
  events: AlertEvent[],
  { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }: AlertOptions = {},
): Promise<boolean> => {
  if (events.length === 0) return true
  const doFetch = fetchImpl ?? fetch
  try {
    const response = await doFetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'hsclubs-guiding-page',
        at: new Date().toISOString(),
        text: events.map(describeAlert).join('\n'),
        events,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}