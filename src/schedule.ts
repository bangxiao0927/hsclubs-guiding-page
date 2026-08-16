/**
 * Runs a task now, then on an interval, until the signal aborts.
 *
 * Deliberately not a cron: the machine this runs on is a personal one that sleeps, reboots and
 * loses power. "Every hour from whenever it started" is honest about that, and a missed window
 * is simply a later poll -- the whole bridge is built so that nothing is lost by being late
 * (see the 1st repo's docs/AGGREGATOR_BRIDGE.md).
 */
export interface ScheduleOptions {
  intervalMs: number
  signal?: AbortSignal
  /** Reported rather than thrown: one bad pass must not end the schedule. */
  onError?: (error: unknown) => void
  /** Test seam. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/**
 * setTimeout stores its delay in a 32-bit signed integer, so anything past ~24.8 days silently
 * wraps and fires almost immediately. The verify interval defaults to 30 days, which lands
 * squarely in that trap and would turn a monthly re-check into a hot loop hammering every
 * school. Sleeping in bounded hops keeps any interval honest.
 */
const MAX_TIMEOUT_MS = 2_147_483_647

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      },
      Math.min(ms, MAX_TIMEOUT_MS),
    )
    signal?.addEventListener('abort', onAbort, { once: true })
  })

export const runOnInterval = async (
  task: () => Promise<void>,
  { intervalMs, signal, onError, sleep = defaultSleep }: ScheduleOptions,
): Promise<void> => {
  while (!signal?.aborted) {
    try {
      await task()
    } catch (error) {
      onError?.(error)
    }
    if (signal?.aborted) return
    // Long intervals are slept in <=24-day hops: a single setTimeout past its 32-bit ceiling
    // wraps to near-zero and would run the task in a tight loop.
    let remaining = intervalMs
    while (remaining > 0 && !signal?.aborted) {
      const hop = Math.min(remaining, MAX_TIMEOUT_MS)
      await sleep(hop, signal)
      remaining -= hop
    }
  }
}
