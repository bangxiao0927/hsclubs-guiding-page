import { describe, expect, it } from 'vitest'

import { buildPayload } from './pagePayload.js'
import type { PageSchool } from './pageData.js'
import { emptyRecord } from './store.js'

const NOW = new Date('2026-08-09T12:00:00Z')

const school = (): PageSchool => ({
  siteUrl: 'https://mvhs.example.org',
  record: {
    ...emptyRecord('mvhs'),
    summary: {
      schoolName: 'Mountain View High School',
      shortName: 'MVHS',
      slug: 'mvhs',
      schoolId: null,
      address: null,
      status: 'active',
      clubCount: 106,
      categories: { STEM: 15, Service: 60 },
      memberCount: 0,
      // The school says its clubs changed a week ago...
      lastUpdatedAt: '2026-08-02T12:00:00+00:00',
      dataHash: 'hash',
    },
    etag: '"abc"',
    // ...this page only noticed an hour ago, and last asked a minute ago.
    lastUpdatedAt: '2026-08-09T11:00:00Z',
    lastPolledAt: '2026-08-09T11:59:00Z',
    lastError: null,
  },
})

describe('buildPayload', () => {
  // Three different questions with three different owners. Collapsing them is how a page ends
  // up telling a visitor a directory changed when only the poller did.
  it('keeps published, seen-here and checked apart', () => {
    const [payload] = buildPayload([school()], { now: NOW }).schools

    expect(payload?.publishedAge).toBe('7 days ago')
    expect(payload?.changedAge).toBe('1 hour ago')
    expect(payload?.checkedAge).toBe('just now')
    expect(payload?.publishedAt).toBe('2026-08-02T12:00:00+00:00')
  })

  it('sorts categories by size and totals the clubs it is showing', () => {
    const payload = buildPayload([school(), school()], { now: NOW })

    expect(payload.schools[0]?.categories.map((c) => c.name)).toEqual(['Service', 'STEM'])
    expect(payload.totals).toEqual({ schools: 2, clubs: 212, checkedAge: 'just now' })
  })

  // A school that has never been read is listed, not hidden, and says so in its status.
  it('marks a school with no summary rather than dropping it', () => {
    const [payload] = buildPayload(
      [{ siteUrl: 'https://new.example.org', record: emptyRecord('new') }],
      { now: NOW },
    ).schools

    expect(payload?.status).toBe('no-data')
    expect(payload?.clubCount).toBeNull()
    expect(payload?.publishedAge).toBe('never')
    expect(payload?.host).toBe('new.example.org')
  })
})
