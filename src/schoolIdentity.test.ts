import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { honoursContract } from './contracts.js'
import { fetchSummary } from './fetchSummary.js'
import { checkIdentity, fetchManifest, manifestUrlFor, type SchoolManifest } from './manifest.js'
import { parseRegistry, RegistryError, saveRegistry, type SchoolEntry } from './registry.js'
import { pollSchool } from './pollSchool.js'
import { emptyRecord } from './store.js'
import { isDemoSchoolId, isSchoolId, issueSchoolId } from './schoolId.js'
import { verifySchool } from './verifySchool.js'

const ID = 'sch_7Qb3Xf9KLm2ZpR4tVn6Y'
const OTHER_ID = 'sch_2Hn5Wq8ZcT1yE7uK4mB0'

const entry = (overrides: Partial<SchoolEntry> = {}): SchoolEntry => ({
  slug: 'mvhs',
  schoolId: ID,
  summaryUrl: 'https://api.mvhs.example.org/api/summary',
  verification: {
    token: 'one-time-token',
    verifiedAt: null,
    lastCheckedAt: null,
    lastError: null,
    state: 'pending',
  },
  listed: true,
  ...overrides,
})

const manifestBody = (overrides: Record<string, unknown> = {}) => ({
  contract: 'hsclubs.school-manifest',
  version: 1,
  schoolId: ID,
  slug: 'mvhs',
  siteOrigin: 'https://api.mvhs.example.org',
  summaryUrl: 'https://api.mvhs.example.org/api/summary',
  capabilities: ['summary.v1'],
  auth: { mobile: { supported: false } },
  ...overrides,
})

const summaryBody = (overrides: Record<string, unknown> = {}) => ({
  schoolName: 'Mountain View High School',
  shortName: 'MVHS',
  slug: 'mvhs',
  address: null,
  status: 'active',
  clubCount: 106,
  categories: {},
  memberCount: 0,
  lastUpdatedAt: '2026-08-08T21:41:31-07:00',
  dataHash: 'hash',
  ...overrides,
})

const routes = ({
  challenge = () => new Response('one-time-token\n'),
  summary = () => new Response(JSON.stringify(summaryBody({ schoolId: ID }))),
  manifest = () => new Response(JSON.stringify(manifestBody())),
}: {
  challenge?: () => Response
  summary?: () => Response
  manifest?: () => Response
} = {}): typeof fetch =>
  (async (url: URL) => {
    if (url.pathname === '/.well-known/hsclubs-site.txt') return challenge()
    if (url.pathname === '/.well-known/hsclubs-app.json') return manifest()
    if (url.pathname === '/api/summary') return summary()
    throw new Error(`unexpected request ${url}`)
  }) as unknown as typeof fetch

const at = () => new Date('2026-08-09T12:00:00Z')

/** A school registered before identities existed. */
const withoutIdentity = (): SchoolEntry => {
  const { schoolId: _issued, ...rest } = entry()
  return rest
}

describe('issueSchoolId', () => {
  it('issues an opaque identity that honours the shared contract', () => {
    const first = issueSchoolId()
    const second = issueSchoolId()

    expect(isSchoolId(first)).toBe(true)
    expect(first).not.toBe(second)
    expect(honoursContract('school-manifest', manifestBody({ schoolId: first }))).toBe(true)
  })

  it('marks a demo identity as one, in the value itself', () => {
    const demo = issueSchoolId({ demo: true })

    expect(isSchoolId(demo)).toBe(true)
    expect(isDemoSchoolId(demo)).toBe(true)
    expect(isDemoSchoolId(issueSchoolId())).toBe(false)
  })

  it('carries nothing about the school in its bytes', () => {
    // Two schools issued in the same millisecond must not share a prefix an observer could use
    // to order or count them.
    const ids = Array.from({ length: 50 }, () => issueSchoolId())
    expect(new Set(ids).size).toBe(50)
    expect(new Set(ids.map((id) => id.slice(4, 8))).size).toBeGreaterThan(40)
  })
})

describe('registry identities', () => {
  const raw = (overrides: Record<string, unknown> = {}) => ({
    slug: 'mvhs',
    summaryUrl: 'https://mvhs.example.org/api/summary',
    verification: { token: 'tok', state: 'verified' },
    listed: true,
    ...overrides,
  })

  it('reads an issued identity and tolerates a school that has none yet', () => {
    expect(parseRegistry({ schools: [raw({ schoolId: ID })] })[0]?.schoolId).toBe(ID)
    expect(parseRegistry({ schools: [raw()] })[0]?.schoolId).toBeUndefined()
  })

  it('refuses a slug wearing the identity field', () => {
    expect(() => parseRegistry({ schools: [raw({ schoolId: 'mvhs' })] })).toThrow(RegistryError)
  })

  it('refuses two schools sharing one identity', () => {
    expect(() =>
      parseRegistry({
        schools: [raw({ schoolId: ID }), raw({ slug: 'other', schoolId: ID })],
      }),
    ).toThrow(/both mvhs and other/)
  })

  it('keeps the identity across a rename, and refuses to rewrite it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hsclubs-identity-'))
    const path = join(dir, 'registry.json')
    await writeFile(path, JSON.stringify({ schools: [raw({ schoolId: ID })] }), 'utf8')

    const [stored] = parseRegistry(JSON.parse(await readFile(path, 'utf8')))
    // A rename is the case this whole design exists for: new handle, new display name, same
    // school.
    await saveRegistry(path, [{ ...stored!, slug: 'mountain-view' }])
    const [renamed] = parseRegistry(JSON.parse(await readFile(path, 'utf8')))
    expect(renamed?.schoolId).toBe(ID)
    expect(renamed?.slug).toBe('mountain-view')

    await expect(saveRegistry(path, [{ ...renamed!, schoolId: OTHER_ID }])).rejects.toThrow(
      /refusing to change the schoolId/,
    )
  })

  it('will not let a school quietly drop the identity it was issued', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hsclubs-identity-'))
    const path = join(dir, 'registry.json')
    await writeFile(path, JSON.stringify({ schools: [raw({ schoolId: ID })] }), 'utf8')

    const [stored] = parseRegistry(JSON.parse(await readFile(path, 'utf8')))
    const { schoolId: _dropped, ...withoutIdentity } = stored!
    await saveRegistry(path, [withoutIdentity])

    expect(parseRegistry(JSON.parse(await readFile(path, 'utf8')))[0]?.schoolId).toBe(ID)
  })
})

describe('summary identity drift', () => {
  const respond = (body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch

  it('accepts a summary stamped with the identity the registry issued', async () => {
    const result = await fetchSummary('https://api.mvhs.example.org/api/summary', 'mvhs', {
      fetchImpl: respond(summaryBody({ schoolId: ID })),
      expectedSchoolId: ID,
    })
    expect(result.outcome === 'updated' && result.summary.schoolId).toBe(ID)
  })

  it("refuses a summary claiming another school's identity", async () => {
    await expect(
      fetchSummary('https://api.mvhs.example.org/api/summary', 'mvhs', {
        fetchImpl: respond(summaryBody({ schoolId: OTHER_ID })),
        expectedSchoolId: ID,
      }),
    ).rejects.toThrow(/claims schoolId/)
  })

  it('still reads the unversioned summary, which carries no identity at all', async () => {
    const result = await fetchSummary('https://api.mvhs.example.org/api/summary', 'mvhs', {
      fetchImpl: respond(summaryBody()),
      expectedSchoolId: ID,
    })
    expect(result.outcome === 'updated' && result.summary.schoolId).toBeNull()
  })

  // Hourly, not monthly: a school that starts serving another school's summary must not have its
  // numbers stored and shown until the next verification pass.
  it('refuses a drifting summary during an ordinary poll, keeping the last good one', async () => {
    const previous = { ...emptyRecord('mvhs'), lastError: null }
    const { outcome, record } = await pollSchool(entry(), previous, {
      fetchImpl: respond(summaryBody({ schoolId: OTHER_ID })),
    })

    expect(outcome).toBe('failed')
    expect(record.summary).toEqual(previous.summary)
    expect(record.lastError).toMatch(/claims schoolId/)
  })
})

describe('manifest identity', () => {
  it('reads the manifest from the verified origin', () => {
    expect(manifestUrlFor('https://api.mvhs.example.org:8443/api/summary?x=1').toString()).toBe(
      'https://api.mvhs.example.org:8443/.well-known/hsclubs-app.json',
    )
  })

  it('accepts a manifest that agrees with the registry', async () => {
    const result = await fetchManifest(entry(), { fetchImpl: routes() })
    expect(result.outcome).toBe('ok')
    expect(result.outcome === 'ok' && result.manifest.schoolId).toBe(ID)
  })

  it('reports a school that has not published one yet as absent, not broken', async () => {
    const result = await fetchManifest(entry(), {
      fetchImpl: routes({ manifest: () => new Response('not found', { status: 404 }) }),
    })
    expect(result).toMatchObject({ outcome: 'problem', problem: 'absent' })
  })

  it('names each disagreement separately, because each needs a different answer', () => {
    const manifest = (overrides: Partial<SchoolManifest> = {}): SchoolManifest => ({
      schoolId: ID,
      slug: 'mvhs',
      siteOrigin: 'https://api.mvhs.example.org',
      summaryUrl: 'https://api.mvhs.example.org/api/summary',
      capabilities: ['summary.v1'],
      mobileAuth: { supported: false, startUrl: null, completeUrl: null },
      ...overrides,
    })

    expect(checkIdentity(entry(), manifest({ schoolId: OTHER_ID }))).toMatchObject({
      problem: 'id-mismatch',
    })
    expect(checkIdentity(entry(), manifest({ siteOrigin: 'https://elsewhere.example' }))).toMatchObject(
      { problem: 'origin-mismatch' },
    )
    expect(
      checkIdentity(entry(), manifest({ summaryUrl: 'https://elsewhere.example/api/summary' })),
    ).toMatchObject({ problem: 'origin-mismatch' })
    expect(checkIdentity(entry(), manifest({ slug: 'mountain-view' }))).toMatchObject({
      problem: 'slug-mismatch',
    })
    expect(checkIdentity(withoutIdentity(), manifest())).toMatchObject({
      problem: 'id-missing',
    })
  })

  it('refuses a manifest that does not honour the contract', async () => {
    const result = await fetchManifest(entry(), {
      fetchImpl: routes({
        manifest: () => new Response(JSON.stringify(manifestBody({ siteOrigin: 'http://api.mvhs.example.org' }))),
      }),
    })
    expect(result).toMatchObject({ outcome: 'problem', problem: 'invalid' })
  })

  it('does not follow a redirect to somebody else for it', async () => {
    const result = await fetchManifest(entry(), {
      fetchImpl: routes({
        manifest: () =>
          new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/m.json' } }),
      }),
    })
    expect(result).toMatchObject({ outcome: 'problem', problem: 'invalid' })
  })
})

describe('verification with an identity claim', () => {
  it('records that the school publishes the identity it was issued', async () => {
    const result = await verifySchool(entry(), { now: at, fetchImpl: routes() })

    expect(result.verified).toBe(true)
    expect(result.entry.integration).toEqual({
      checkedAt: '2026-08-09T12:00:00.000Z',
      state: 'ok',
      detail: null,
    })
  })

  it('keeps verifying a school that has not been upgraded yet', async () => {
    const result = await verifySchool(withoutIdentity(), {
      now: at,
      fetchImpl: routes({
        summary: () => new Response(JSON.stringify(summaryBody())),
        manifest: () => new Response('not found', { status: 404 }),
      }),
    })

    expect(result.verified).toBe(true)
    expect(result.entry.integration?.state).toBe('absent')
  })

  it('revokes verification when an origin publishes another school identity', async () => {
    const result = await verifySchool(entry(), {
      now: at,
      fetchImpl: routes({
        manifest: () => new Response(JSON.stringify(manifestBody({ schoolId: OTHER_ID }))),
      }),
    })

    expect(result.verified).toBe(false)
    expect(result.transientFailure).toBe(false)
    expect(result.entry.verification.state).toBe('failing')
    expect(result.entry.integration?.state).toBe('id-mismatch')
    // The reason survives on the entry, so `verify:all` prints something an operator can act on
    // instead of "verification failed".
    expect(result.entry.verification.lastError).toMatch(/publishes schoolId/)
  })

  it('records a stale slug without revoking the identity', async () => {
    const result = await verifySchool(entry(), {
      now: at,
      fetchImpl: routes({ manifest: () => new Response(JSON.stringify(manifestBody({ slug: 'mountain-view' }))) }),
    })

    expect(result.verified).toBe(true)
    expect(result.entry.integration?.state).toBe('slug-mismatch')
  })

  it('does not let an unreachable manifest disprove a verified school', async () => {
    const result = await verifySchool(entry(), {
      now: at,
      fetchImpl: routes({ manifest: () => new Response('boom', { status: 503 }) }),
    })

    expect(result.verified).toBe(true)
    expect(result.entry.integration?.state).toBe('unreachable')
  })
})
