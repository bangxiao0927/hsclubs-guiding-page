import { describe, expect, it } from 'vitest'

import { assessRelease, assessSchool } from './releaseReadiness.js'
import type { SchoolEntry } from './registry.js'

const entry = (overrides: Partial<SchoolEntry> = {}): SchoolEntry => ({
  slug: 'mvhs',
  schoolId: 'sch_7Qb3Xf9KLm2ZpR4tVn6Y',
  summaryUrl: 'https://mvhs.example.org/api/summary',
  verification: {
    token: 'tok',
    verifiedAt: '2026-08-18T00:00:00Z',
    lastCheckedAt: '2026-08-18T00:00:00Z',
    lastError: null,
    state: 'verified',
  },
  listed: true,
  integration: { checkedAt: '2026-08-18T00:00:00Z', state: 'ok', detail: null, mobileAuth: true },
  ...overrides,
})

/** A school that predates identities, built by dropping the optional fields exactOptionalProps forbids passing as undefined. */
const withoutOptional = (base: SchoolEntry, keys: Array<'schoolId' | 'integration'>): SchoolEntry => {
  const copy = { ...base }
  for (const key of keys) delete (copy as Record<string, unknown>)[key]
  return copy
}

describe('assessSchool', () => {
  it('is ready when identified, verified and manifest-clean', () => {
    expect(assessSchool(entry()).ready).toBe(true)
  })

  it('blocks a school with no identity, failing verification or a bad manifest', () => {
    const { schoolId: _none, ...noId } = entry()
    expect(assessSchool(noId).blockers).toContain('no immutable schoolId has been issued')
    expect(assessSchool(entry({ verification: { ...entry().verification, state: 'failing' } })).ready).toBe(false)
    expect(assessSchool(entry({ integration: { checkedAt: null, state: 'id-mismatch', detail: 'x' } })).ready).toBe(false)
    expect(assessSchool(withoutOptional(entry(), ['integration'])).blockers).toContain('the manifest has not been checked yet')
  })

  it('never blocks a demo school', () => {
    const demo = assessSchool(entry({ demo: true, verification: { ...entry().verification, state: 'failing' } }))
    expect(demo.demo).toBe(true)
    expect(demo.ready).toBe(true)
  })
})

describe('assessRelease', () => {
  it('is ready only when every real school is ready', () => {
    const ready = assessRelease([entry(), entry({ slug: 'demo', schoolId: 'sch_demoAAAAAAAAAAAAAA', demo: true })])
    expect(ready.ready).toBe(true)

    const blocked = assessRelease([
      entry(),
      entry({ slug: 'harborview', schoolId: 'sch_5Jd9Rk2XvA6nQ3zP8wC1', integration: { checkedAt: null, state: 'unreachable', detail: null } }),
    ])
    expect(blocked.ready).toBe(false)
  })

  it('a failing demo school does not block the release', () => {
    const result = assessRelease([
      entry(),
      entry({ slug: 'bay-meadows', schoolId: 'sch_demoBBBBBBBBBBBBBB', demo: true, verification: { ...entry().verification, state: 'failing' } }),
    ])
    expect(result.ready).toBe(true)
  })

  it('ignores unlisted schools', () => {
    const result = assessRelease([withoutOptional(entry({ listed: false }), ['schoolId'])])
    expect(result.schools).toEqual([])
    expect(result.ready).toBe(true)
  })
})
