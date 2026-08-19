import { describe, expect, it } from 'vitest'

import { buildAppDirectory } from './appDirectory.js'
import { honoursContract } from './contracts.js'
import type { SchoolEntry } from './registry.js'
import { emptyRecord, type SchoolRecord } from './store.js'
import type { SchoolStore } from './store.js'

const ID = 'sch_7Qb3Xf9KLm2ZpR4tVn6Y'
const NOW = new Date('2026-08-18T04:11:02Z')

const entry = (overrides: Partial<SchoolEntry> = {}): SchoolEntry => ({
  slug: 'mvhs',
  schoolId: ID,
  summaryUrl: 'https://mvhs.example.org/api/summary',
  verification: {
    token: 'tok',
    verifiedAt: '2026-08-18T00:00:00Z',
    lastCheckedAt: '2026-08-18T00:00:00Z',
    lastError: null,
    state: 'verified',
  },
  listed: true,
  integration: { checkedAt: '2026-08-18T00:00:00Z', state: 'ok', detail: null, mobileAuth: false },
  ...overrides,
})

const record = (slug: string, overrides: Partial<SchoolRecord> = {}): SchoolRecord => ({
  ...emptyRecord(slug),
  summary: {
    schoolName: 'Mountain View High School',
    shortName: 'MVHS',
    slug,
    schoolId: ID,
    address: null,
    status: 'active',
    clubCount: 106,
    categories: {},
    memberCount: 0,
    lastUpdatedAt: '2026-08-08T21:41:31.064406-07:00',
    dataHash: 'hash',
  },
  ...overrides,
})

// A duck-typed store: buildAppDirectory only ever calls get(), and the real SchoolStore's
// constructor is private, so a small stand-in keeps these tests off the filesystem.
const storeOf = (contents: Record<string, SchoolRecord>): SchoolStore =>
  ({ get: (slug: string) => contents[slug] ?? emptyRecord(slug) }) as unknown as SchoolStore

describe('buildAppDirectory', () => {
  it('emits a document that honours the shared contract', () => {
    const directory = buildAppDirectory([entry()], storeOf({ mvhs: record('mvhs') }), { now: NOW })

    expect(honoursContract('app-directory', directory)).toBe(true)
    expect(directory).toMatchObject({ contract: 'hsclubs.app-directory', version: 1 })
  })

  it('returns identity, display name, verified origin, host and status for a school', () => {
    const [school] = buildAppDirectory([entry()], storeOf({ mvhs: record('mvhs') }), { now: NOW }).schools

    expect(school).toMatchObject({
      schoolId: ID,
      slug: 'mvhs',
      name: 'Mountain View High School',
      siteOrigin: 'https://mvhs.example.org',
      host: 'mvhs.example.org',
      integrationStatus: 'compatible',
      clubCount: 106,
    })
  })

  it('offers mobile auth only when the manifest confirmed it and the school is compatible', () => {
    const withAuth = entry({
      integration: { checkedAt: null, state: 'ok', detail: null, mobileAuth: true },
    })
    expect(buildAppDirectory([withAuth], storeOf({ mvhs: record('mvhs') })).schools[0]?.mobileAuth).toBe(
      true,
    )
    // Same capability claimed, but the school is not compatible: the app must not be sent into a
    // sign-in a degraded school cannot complete.
    const degradedWithAuth = entry({
      integration: { checkedAt: null, state: 'absent', detail: null, mobileAuth: true },
    })
    expect(
      buildAppDirectory([degradedWithAuth], storeOf({ mvhs: record('mvhs') })).schools[0]?.mobileAuth,
    ).toBe(false)
  })

  it('excludes a school that has not been issued an identity yet', () => {
    const { schoolId: _none, ...noIdentity } = entry()
    const directory = buildAppDirectory([noIdentity], storeOf({ mvhs: record('mvhs') }))
    expect(directory.schools).toEqual([])
  })

  it('excludes an unlisted school', () => {
    const directory = buildAppDirectory([entry({ listed: false })], storeOf({ mvhs: record('mvhs') }))
    expect(directory.schools).toEqual([])
  })

  it('marks a school with no summary yet as degraded but still openable', () => {
    const noSummary = { ...record('mvhs'), summary: null }
    const [school] = buildAppDirectory(
      [entry({ integration: { checkedAt: null, state: 'absent', detail: null } })],
      storeOf({ mvhs: noSummary }),
      { now: NOW },
    ).schools

    expect(school).toMatchObject({ integrationStatus: 'degraded', name: 'mvhs', clubCount: null })
  })
})

describe('error isolation', () => {
  it('keeps a directory valid and full when one school is incompatible', () => {
    const good = entry()
    const claimsAnother = entry({
      slug: 'harborview',
      schoolId: 'sch_5Jd9Rk2XvA6nQ3zP8wC1',
      summaryUrl: 'https://clubs.harborview.example/api/summary',
      integration: {
        checkedAt: null,
        state: 'id-mismatch',
        detail: 'harborview publishes schoolId sch_other',
      },
    })

    const directory = buildAppDirectory([good, claimsAnother], storeOf({ mvhs: record('mvhs') }), {
      now: NOW,
    })

    expect(honoursContract('app-directory', directory)).toBe(true)
    expect(directory.schools.map((s) => s.integrationStatus)).toEqual(['compatible', 'incompatible'])
    const bad = directory.schools[1]!
    expect(bad.unavailableReason).toBeTruthy()
    // The reason is this page's own text, never anything the failing school sent.
    expect(bad.unavailableReason).not.toContain('sch_other')
    expect(bad.clubCount).toBeNull()
    expect(bad.mobileAuth).toBe(false)
  })

  it('marks a failing-verification school incompatible without dropping it', () => {
    const failing = entry({
      verification: { ...entry().verification, state: 'failing' },
    })
    const [school] = buildAppDirectory([failing], storeOf({ mvhs: record('mvhs') })).schools
    expect(school).toMatchObject({ integrationStatus: 'incompatible' })
    expect(school?.unavailableReason).toBeTruthy()
  })

  it('isolates a school whose record cannot be read instead of failing the response', () => {
    // A summaryUrl that survived registry parsing but will not give an origin here: the row is
    // still emitted, as not-openable, and the other school is untouched.
    const corrupt = { ...entry({ slug: 'broken', schoolId: 'sch_2Hn5Wq8ZcT1yE7uK4mB0' }) }
    // Force the URL parse to throw by making buildSchool's store.get blow up.
    const explodingStore = {
      get(slug: string): SchoolRecord {
        if (slug === 'broken') throw new Error('record decode failed')
        return record(slug)
      },
    } as unknown as SchoolStore

    const directory = buildAppDirectory([entry(), corrupt], explodingStore, { now: NOW })

    expect(honoursContract('app-directory', directory)).toBe(true)
    expect(directory.schools.map((s) => s.slug)).toEqual(['mvhs', 'broken'])
    expect(directory.schools[1]).toMatchObject({
      integrationStatus: 'incompatible',
      unavailableReason: 'the school record could not be read',
    })
  })

  it('is a valid, empty document when there are no eligible schools', () => {
    const directory = buildAppDirectory([], storeOf({}), { now: NOW })
    expect(honoursContract('app-directory', directory)).toBe(true)
    expect(directory.schools).toEqual([])
  })
})

describe('stability and bounds', () => {
  it('keeps registry order across builds', () => {
    const a = entry({ slug: 'a', schoolId: 'sch_aaaaaaaaaaaaaaaaaa' })
    const b = entry({ slug: 'b', schoolId: 'sch_bbbbbbbbbbbbbbbbbb' })
    const store = storeOf({ a: record('a'), b: record('b') })

    expect(buildAppDirectory([a, b], store).schools.map((s) => s.slug)).toEqual(['a', 'b'])
    expect(buildAppDirectory([b, a], store).schools.map((s) => s.slug)).toEqual(['b', 'a'])
  })

  it('caps the directory at a defensive ceiling', () => {
    const many = Array.from({ length: 5 }, (_unused, index) =>
      entry({ slug: `s${index}`, schoolId: `sch_${'x'.repeat(15)}${index}` }),
    )
    const directory = buildAppDirectory(many, storeOf({}), { maxSchools: 2 })
    expect(directory.schools).toHaveLength(2)
  })
})

describe('demo isolation', () => {
  it('keeps the demo flag so the app can label a fixture', () => {
    const demo = entry({ slug: 'bay-meadows', schoolId: 'sch_demo7Qb3Xf9KLm2Zp', demo: true })
    const [school] = buildAppDirectory([demo], storeOf({ 'bay-meadows': record('bay-meadows') })).schools
    expect(school?.demo).toBe(true)
  })
})
