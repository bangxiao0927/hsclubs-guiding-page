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
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
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
    await sleep(intervalMs, signal)
  }
}
