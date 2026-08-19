import { describe, expect, it } from 'vitest'

import { pollSchool } from './pollSchool.js'
import type { SchoolEntry } from './registry.js'
import { emptyRecord, type SchoolRecord } from './store.js'

const school: SchoolEntry = {
  slug: 'mvhs',
  summaryUrl: 'https://mvhs.example.org/api/summary',
  verification: {
    token: 'tok',
    verifiedAt: null,
    lastCheckedAt: null,
    lastError: null,
    state: 'verified',
  },
  listed: true,
}

const SUMMARY = {
  schoolName: 'Mountain View High School',
  shortName: 'MVHS',
  slug: 'mvhs',
  schoolId: null,
  address: null,
  status: 'active',
  clubCount: 106,
  categories: {},
  memberCount: 0,
  lastUpdatedAt: '2026-08-08T21:41:31.064406-07:00',
  dataHash: '5907928d',
}

const at = (iso: string) => () => new Date(iso)

const respondWith = (status: number, body?: unknown, etag?: string): typeof fetch =>
  (async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: etag ? { etag } : {},
    })) as unknown as typeof fetch

describe('pollSchool', () => {
  it('stores the summary and the etag on the first poll', async () => {
    const { outcome, record } = await pollSchool(school, emptyRecord('mvhs'), {
      fetchImpl: respondWith(200, SUMMARY, '"abc123"'),
      now: at('2026-08-09T00:00:00Z'),
    })

    expect(outcome).toBe('updated')
    expect(record).toMatchObject({
      slug: 'mvhs',
      etag: '"abc123"',
      lastPolledAt: '2026-08-09T00:00:00.000Z',
      lastUpdatedAt: '2026-08-09T00:00:00.000Z',
      lastError: null,
    })
    expect(record.summary?.clubCount).toBe(106)
  })

  // The exit check for Phase 1: the second poll of an unchanged school costs a 304 and keeps
  // everything it already had.
  it('keeps the stored summary when the school answers 304', async () => {
    const previous: SchoolRecord = {
      slug: 'mvhs',
      summary: { ...SUMMARY, shortName: 'MVHS' },
      etag: '"abc123"',
      lastPolledAt: '2026-08-08T00:00:00.000Z',
      lastUpdatedAt: '2026-08-08T00:00:00.000Z',
      lastError: null,
      failureStreak: 0,
      history: [],
    }

    const { outcome, record } = await pollSchool(school, previous, {
      fetchImpl: respondWith(304),
      now: at('2026-08-09T00:00:00Z'),
    })

    expect(outcome).toBe('not-modified')
    expect(record.summary).toEqual(previous.summary)
    expect(record.etag).toBe('"abc123"')
    // Polled now, but not *updated* now: the page should say how fresh the data is, not how
    // recently we asked.
    expect(record.lastPolledAt).toBe('2026-08-09T00:00:00.000Z')
    expect(record.lastUpdatedAt).toBe('2026-08-08T00:00:00.000Z')
  })

  // A school being down must not empty its card; stale with a reason beats gone.
  it('keeps the last good summary when the poll fails, and records why', async () => {
    const previous: SchoolRecord = {
      slug: 'mvhs',
      summary: SUMMARY,
      etag: '"abc123"',
      lastPolledAt: '2026-08-08T00:00:00.000Z',
      lastUpdatedAt: '2026-08-08T00:00:00.000Z',
      lastError: null,
      failureStreak: 0,
      history: [],
    }

    const { outcome, record } = await pollSchool(school, previous, {
      fetchImpl: respondWith(503),
      now: at('2026-08-09T00:00:00Z'),
    })

    expect(outcome).toBe('failed')
    expect(record.summary).toEqual(SUMMARY)
    expect(record.etag).toBe('"abc123"')
    expect(record.lastError).toMatch(/503/)
    expect(record.lastPolledAt).toBe('2026-08-09T00:00:00.000Z')
  })

  it('clears a previous error once the school answers again', async () => {
    const previous: SchoolRecord = { ...emptyRecord('mvhs'), lastError: 'mvhs.example.org answered 503' }

    const { record } = await pollSchool(school, previous, {
      fetchImpl: respondWith(200, SUMMARY, '"new"'),
      now: at('2026-08-09T00:00:00Z'),
    })

    expect(record.lastError).toBeNull()
  })

  // "fetch failed" is Node's message for every transport problem; the reason lives in `cause`,
  // and it is the difference between a typo in a URL and an expired certificate.
  it('records why a transport failure happened, not just that one did', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND mvhs.invalid') })
    }) as unknown as typeof fetch

    const { outcome, record } = await pollSchool(school, emptyRecord('mvhs'), { fetchImpl })

    expect(outcome).toBe('failed')
    expect(record.lastError).toBe('fetch failed: getaddrinfo ENOTFOUND mvhs.invalid')
  })
})
