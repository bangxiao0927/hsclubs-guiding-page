import { describe, expect, it } from 'vitest'

import type { SchoolEntry } from './registry.js'
import { challengeUrlFor, issueVerificationToken, verifySchool } from './verifySchool.js'

const entry = (overrides: Partial<SchoolEntry> = {}): SchoolEntry => ({
  slug: 'mvhs',
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

const SUMMARY = {
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
}

const routes = (
  challenge: () => Response | Promise<Response>,
  summary: () => Response | Promise<Response> = () => new Response(JSON.stringify(SUMMARY)),
): typeof fetch =>
  (async (url: URL, init: RequestInit) => {
    if (url.pathname === '/.well-known/hsclubs-site.txt') return challenge()
    if (url.pathname === '/api/summary') return summary()
    throw new Error(`unexpected request ${url}`)
  }) as unknown as typeof fetch

const at = () => new Date('2026-08-09T12:00:00Z')

describe('issueVerificationToken', () => {
  it('issues a different, copy-safe 256-bit token each time', () => {
    const first = issueVerificationToken()
    const second = issueVerificationToken()

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
  })
})

describe('challengeUrlFor', () => {
  it('uses the same origin as the summary, including a non-default port', () => {
    expect(challengeUrlFor('https://api.example.org:8443/api/summary?x=1').toString()).toBe(
      'https://api.example.org:8443/.well-known/hsclubs-site.txt',
    )
  })
})

describe('verifySchool', () => {
  it('verifies matching origin control and school identity', async () => {
    const result = await verifySchool(entry(), {
      now: at,
      fetchImpl: routes(() => new Response('one-time-token\n')),
    })

    expect(result.verified).toBe(true)
    expect(result.entry.verification).toEqual({
      token: 'one-time-token',
      state: 'verified',
      verifiedAt: '2026-08-09T12:00:00.000Z',
      lastCheckedAt: '2026-08-09T12:00:00.000Z',
      lastError: null,
    })
  })

  // One newline is a normal text file. Anything else is data around the token, not the file the
  // verifier asked for.
  it('accepts one trailing newline but not surrounding text', async () => {
    const accepted = await verifySchool(entry(), {
      fetchImpl: routes(() => new Response('one-time-token\r\n')),
    })
    const rejected = await verifySchool(entry(), {
      fetchImpl: routes(() => new Response('prefix one-time-token suffix')),
    })

    expect(accepted.verified).toBe(true)
    expect(rejected.verified).toBe(false)
    expect(rejected.entry.verification.lastError).toMatch(/did not match/)
  })

  it('does not trust a redirect for the challenge', async () => {
    let redirectMode: string | undefined
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      redirectMode = init.redirect
      if (url.pathname.includes('.well-known')) {
        return new Response('', { status: 302, headers: { location: 'https://evil.example/token' } })
      }
      return new Response(JSON.stringify(SUMMARY))
    }) as unknown as typeof fetch

    const result = await verifySchool(entry(), { fetchImpl })

    expect(redirectMode).toBe('manual')
    expect(result.verified).toBe(false)
    expect(result.entry.verification.lastError).toMatch(/redirected/)
  })

  it('fails if the summary claims another school, even with the right token', async () => {
    const result = await verifySchool(entry(), {
      fetchImpl: routes(
        () => new Response('one-time-token'),
        () => new Response(JSON.stringify({ ...SUMMARY, slug: 'another-school' })),
      ),
    })

    expect(result.verified).toBe(false)
    expect(result.entry.verification.lastError).toMatch(/another-school/)
  })

  it('fails closed when no token was issued, without making a request', async () => {
    let called = false
    const result = await verifySchool(
      entry({ verification: { ...entry().verification, token: null } }),
      {
        fetchImpl: (async () => {
          called = true
          throw new Error('should not run')
        }) as unknown as typeof fetch,
      },
    )

    expect(called).toBe(false)
    expect(result.entry.verification.state).toBe('failing')
    expect(result.entry.verification.lastError).toMatch(/No verification token/)
  })

  it('keeps the previous verifiedAt when a later re-verification fails', async () => {
    const previouslyVerified = entry({
      verification: {
        token: 'one-time-token',
        state: 'verified',
        verifiedAt: '2026-07-01T00:00:00Z',
        lastCheckedAt: '2026-07-01T00:00:00Z',
        lastError: null,
      },
    })

    const result = await verifySchool(previouslyVerified, {
      now: at,
      fetchImpl: routes(() => new Response('', { status: 404 })),
    })

    expect(result.entry.verification).toMatchObject({
      state: 'failing',
      verifiedAt: '2026-07-01T00:00:00Z',
      lastCheckedAt: '2026-08-09T12:00:00.000Z',
      lastError: 'Challenge answered 404',
    })
  })

  // A brief DNS outage, timeout or 5xx proves nothing about ownership. Hiding a verified school
  // for the default 30-day re-check interval after one local network blip would black out the
  // whole page at once.
  it('keeps a previously verified school verified on a transient network failure', async () => {
    const previouslyVerified = entry({
      verification: {
        token: 'one-time-token',
        state: 'verified',
        verifiedAt: '2026-07-01T00:00:00Z',
        lastCheckedAt: '2026-07-01T00:00:00Z',
        lastError: null,
      },
    })
    const result = await verifySchool(previouslyVerified, {
      now: at,
      fetchImpl: (async () => {
        throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') })
      }) as unknown as typeof fetch,
    })

    expect(result).toMatchObject({ verified: false, transientFailure: true })
    expect(result.entry.verification).toMatchObject({
      state: 'verified',
      verifiedAt: '2026-07-01T00:00:00Z',
      lastCheckedAt: '2026-08-09T12:00:00.000Z',
    })
  })

  it('keeps a previously verified school verified when the challenge answers 503', async () => {
    const previouslyVerified = entry({
      verification: { ...entry().verification, state: 'verified', verifiedAt: '2026-07-01T00:00:00Z' },
    })

    const result = await verifySchool(previouslyVerified, {
      fetchImpl: routes(() => new Response('', { status: 503 })),
    })

    expect(result.transientFailure).toBe(true)
    expect(result.entry.verification.state).toBe('verified')
  })

  it('stops reading a challenge over the configured size cap', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const result = await verifySchool(entry(), {
      maxBytes: 2048,
      fetchImpl: routes(() => new Response(stream)),
    })

    expect(result.verified).toBe(false)
    expect(result.entry.verification.lastError).toMatch(/cap/)
  })
})
