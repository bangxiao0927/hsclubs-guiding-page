import { describe, expect, it } from 'vitest'

import { pageRecords } from './pageData.js'
import type { SchoolEntry } from './registry.js'
import { emptyRecord, type SchoolRecord, type SchoolStore } from './store.js'

const school = (slug: string, state: SchoolEntry['verification']['state'], listed = true): SchoolEntry => ({
  slug,
  summaryUrl: `https://${slug}.example.org/api/summary`,
  verification: {
    token: 't',
    verifiedAt: null,
    lastCheckedAt: null,
    lastError: null,
    state,
  },
  listed,
})

const fakeStore = (records: Record<string, SchoolRecord>): SchoolStore =>
  ({ get: (slug: string) => records[slug] ?? emptyRecord(slug) }) as SchoolStore

describe('pageRecords', () => {
  it('renders only verified schools the operator has listed', () => {
    const store = fakeStore({
      verified: emptyRecord('verified'),
      failing: emptyRecord('failing'),
      hidden: emptyRecord('hidden'),
    })

    expect(
      pageRecords(
        [school('verified', 'verified'), school('failing', 'failing'), school('hidden', 'verified', false)],
        store,
      ).map((record) => record.slug),
    ).toEqual(['verified'])
  })

  // Verification can succeed before the first summary poll; show the school with "No data yet"
  // rather than silently omitting it from the only page that can explain what happened.
  it('returns an empty record for a newly verified school the store has never seen', () => {
    expect(pageRecords([school('newschool', 'verified')], fakeStore({}))).toEqual([
      emptyRecord('newschool'),
    ])
  })
})
