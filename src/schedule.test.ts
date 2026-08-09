import { describe, expect, it } from 'vitest'

import { runOnInterval } from './schedule.js'

describe('runOnInterval', () => {
  it('runs immediately, then once per interval, until aborted', async () => {
    const controller = new AbortController()
    let runs = 0
    const sleeps: number[] = []

    await runOnInterval(
      async () => {
        runs += 1
        if (runs === 3) controller.abort()
      },
      {
        intervalMs: 60_000,
        signal: controller.signal,
        sleep: async (ms) => {
          sleeps.push(ms)
        },
      },
    )

    expect(runs).toBe(3)
    // Two sleeps for three runs: the first pass happens straight away, which is what makes
    // starting the watcher a useful thing to do.
    expect(sleeps).toEqual([60_000, 60_000])
  })

  it('does not run at all if the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let runs = 0

    await runOnInterval(
      async () => {
        runs += 1
      },
      { intervalMs: 1, signal: controller.signal, sleep: async () => undefined },
    )

    expect(runs).toBe(0)
  })

  // A failing pass is the normal case here -- schools go down -- and it must not end the
  // schedule, or one bad night would leave the page frozen until someone noticed.
  it('reports a failing pass and keeps going', async () => {
    const controller = new AbortController()
    const errors: unknown[] = []
    let runs = 0

    await runOnInterval(
      async () => {
        runs += 1
        if (runs === 1) throw new Error('registry unreadable')
        controller.abort()
      },
      {
        intervalMs: 1,
        signal: controller.signal,
        sleep: async () => undefined,
        onError: (error) => errors.push(error),
      },
    )

    expect(runs).toBe(2)
    expect((errors[0] as Error).message).toBe('registry unreadable')
  })

  it('stops without waiting out the interval when aborted during a pass', async () => {
    const controller = new AbortController()
    let slept = false

    await runOnInterval(async () => controller.abort(), {
      intervalMs: 60_000,
      signal: controller.signal,
      sleep: async () => {
        slept = true
      },
    })

    expect(slept).toBe(false)
  })

  it('wakes early when the real sleep is aborted', async () => {
    const controller = new AbortController()
    let runs = 0
    const started = Date.now()

    const loop = runOnInterval(
      async () => {
        runs += 1
      },
      { intervalMs: 60_000, signal: controller.signal },
    )
    // No fake timer: this is the one place the default sleep itself is under test, and a
    // 60s interval would otherwise make the suite take a minute to prove it.
    setTimeout(() => controller.abort(), 10)
    await loop

    expect(runs).toBe(1)
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})
