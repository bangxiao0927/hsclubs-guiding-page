import { describe, expect, it } from 'vitest'

import type { SchoolEntry } from './registry.js'
import { verifyAllSchools } from './verifyAll.js'

const entry = (slug: string, listed = true): SchoolEntry => ({
  slug,
  summaryUrl: `https://${slug}.example.org/api/summary`,
  verification: {
    token: `${slug}-token`,
    verifiedAt: null,
    lastCheckedAt: null,
    lastError: null,
    state: 'pending',
  },
  listed,
})

const summary = (slug: string) => ({
  schoolName: `${slug} High`,
  shortName: slug,
  slug,
  address: null,
  status: 'active',
  clubCount: 1,
  categories: {},
  memberCount: 0,
  lastUpdatedAt: null,
  dataHash: 'hash',
})

describe('verifyAllSchools', () => {
  it('checks every listed school independently and preserves order', async () => {
    const fetchImpl = (async (url: URL) => {
      const slug = url.host.split('.')[0]!
      if (url.pathname.includes('.well-known')) {
        return new Response(slug === 'broken' ? 'wrong' : `${slug}-token`)
      }
      return new Response(JSON.stringify(summary(slug)))
    }) as unknown as typeof fetch

    const report = await verifyAllSchools([entry('alpha'), entry('broken'), entry('beta')], {
      fetchImpl,
    })

    expect(report).toMatchObject({ checked: 3, verified: 2, failing: 1 })
    expect(report.entries.map((school) => school.slug)).toEqual(['alpha', 'broken', 'beta'])
    expect(report.entries.map((school) => school.verification.state)).toEqual([
      'verified',
      'failing',
      'verified',
    ])
  })

  // listed=false is the operator ending the link. Do not keep reaching out after they did.
  it('leaves an unlisted school untouched and does not fetch it', async () => {
    let calls = 0
    const hidden = entry('hidden', false)
    const report = await verifyAllSchools([hidden], {
      fetchImpl: (async () => {
        calls += 1
        throw new Error('should not run')
      }) as unknown as typeof fetch,
    })

    expect(calls).toBe(0)
    expect(report).toMatchObject({ checked: 0, verified: 0, failing: 0 })
    expect(report.entries[0]).toEqual(hidden)
  })
})
