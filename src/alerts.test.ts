import { describe, expect, it, vi } from 'vitest'

import { alertsFor, describeAlert, sendAlerts } from './alerts.js'
import { emptyRecord, type SchoolRecord } from './store.js'

const record = (slug: string, failureStreak: number, lastError: string | null = null): SchoolRecord => ({
  ...emptyRecord(slug),
  failureStreak,
  lastError,
})

const before = (...records: SchoolRecord[]) => new Map(records.map((r) => [r.slug, r]))

describe('alertsFor', () => {
  it('fires when a school crosses the threshold, and only then', () => {
    expect(alertsFor(before(record('mvhs', 1)), [record('mvhs', 2, 'timeout')], 3)).toEqual([])

    const crossing = alertsFor(before(record('mvhs', 2)), [record('mvhs', 3, 'timeout')], 3)
    expect(crossing).toEqual([{ slug: 'mvhs', kind: 'failing', streak: 3, error: 'timeout' }])

    // Still down an hour later: not news.
    expect(alertsFor(before(record('mvhs', 3)), [record('mvhs', 4, 'timeout')], 3)).toEqual([])
  })

  it('reports a recovery, but only for a failure it reported', () => {
    expect(alertsFor(before(record('mvhs', 4)), [record('mvhs', 0)], 3)).toEqual([
      { slug: 'mvhs', kind: 'recovered', streak: 0, error: null },
    ])
    // A blip that never crossed the threshold recovers quietly.
    expect(alertsFor(before(record('mvhs', 2)), [record('mvhs', 0)], 3)).toEqual([])
  })

  // A school added between passes has no history; it must not read as a recovery.
  it('says nothing about a school it has not seen before', () => {
    expect(alertsFor(new Map(), [record('new', 0)], 3)).toEqual([])
    expect(alertsFor(new Map(), [record('new', 1, 'boom')], 3)).toEqual([])
  })

  it('describes what happened in one line', () => {
    expect(describeAlert({ slug: 'mvhs', kind: 'failing', streak: 3, error: '503' })).toBe(
      'mvhs has failed 3 polls in a row: 503',
    )
    expect(describeAlert({ slug: 'mvhs', kind: 'recovered', streak: 0, error: null })).toBe(
      'mvhs is answering again',
    )
  })
})

describe('sendAlerts', () => {
  it('posts one payload carrying both the text and the events', async () => {
    const calls: [string, RequestInit][] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push([url, init])
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch

    await sendAlerts('https://hooks.example.org/x', [
      { slug: 'mvhs', kind: 'failing', streak: 3, error: '503' },
    ], { fetchImpl })

    expect(calls).toHaveLength(1)
    const body = JSON.parse(String(calls[0]?.[1].body))
    expect(body.text).toContain('mvhs has failed 3 polls')
    expect(body.events).toHaveLength(1)
  })

  it('does not call out at all when there is nothing to say', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch

    expect(await sendAlerts('https://hooks.example.org/x', [], { fetchImpl })).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  // Losing a notification is a smaller failure than losing the poller.
  it('swallows an unreachable endpoint rather than ending the pass', async () => {
    const fetchImpl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }) as unknown as typeof fetch

    await expect(
      sendAlerts('https://hooks.example.org/x', [{ slug: 'a', kind: 'failing', streak: 3, error: null }], {
        fetchImpl,
      }),
    ).resolves.toBe(false)
  })
})