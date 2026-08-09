import { describe, expect, it } from 'vitest'

import { fetchSummary, SummaryFetchError } from './fetchSummary.js'

const SUMMARY = {
  schoolName: 'Mountain View High School',
  shortName: 'MVHS',
  slug: 'mvhs',
  address: '3535 Truman Ave, Mountain View, CA 94040',
  status: 'active',
  clubCount: 106,
  categories: { 'STEM & Innovation': 15 },
  memberCount: 0,
  lastUpdatedAt: '2026-08-08T21:41:31.064406-07:00',
  dataHash: '5907928d',
}

const respond = (
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): typeof fetch =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json', ...init.headers },
    })) as unknown as typeof fetch

describe('fetchSummary', () => {
  it('returns the parsed summary and the etag to poll with next time', async () => {
    const result = await fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', {
      fetchImpl: respond(SUMMARY, { headers: { etag: '"abc123"' } }),
    })

    expect(result).toMatchObject({ outcome: 'updated', etag: '"abc123"' })
    if (result.outcome !== 'updated') throw new Error('unreachable')
    expect(result.summary.schoolName).toBe('Mountain View High School')
    expect(result.summary.clubCount).toBe(106)
  })

  it('sends the stored etag as If-None-Match and reports an unchanged school', async () => {
    let sent: string | null = null
    const fetchImpl = (async (_url: URL, init: RequestInit) => {
      sent = new Headers(init.headers).get('if-none-match')
      return new Response(null, { status: 304 })
    }) as unknown as typeof fetch

    const result = await fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', {
      etag: '"abc123"',
      fetchImpl,
    })

    expect(sent).toBe('"abc123"')
    expect(result).toEqual({ outcome: 'not-modified' })
  })

  // The URL comes from the registry, so this is a server-side fetch of an address the code did
  // not choose. A redirect would let a registered site point it anywhere, including inside this
  // machine's own network.
  it('refuses to follow a redirect', async () => {
    // Asserting on the option, not only on the status: a mock answers 302 whatever the caller
    // asked for, so without this the test would still pass with `redirect: 'manual'` deleted --
    // while the real behaviour became "follow it and read whatever is there".
    const fetchImpl = (async (_url: URL, init: RequestInit) => {
      expect(init.redirect).toBe('manual')
      return new Response('', {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      })
    }) as unknown as typeof fetch

    await expect(
      fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', { fetchImpl }),
    ).rejects.toBeInstanceOf(SummaryFetchError)
  })

  // An abandoned body holds its connection open until garbage collection, which a long-running
  // poller would feel as a socket leak against a school that always errors.
  it('releases the body of a response it refuses to read', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8))
      },
      cancel() {
        cancelled = true
      },
    })
    const fetchImpl = (async () => new Response(stream, { status: 503 })) as unknown as typeof fetch

    await expect(
      fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', { fetchImpl }),
    ).rejects.toThrow(/503/)
    expect(cancelled).toBe(true)
  })

  it('refuses a non-https url before making any request', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response('{}')
    }) as unknown as typeof fetch

    await expect(
      fetchSummary('http://mvhs.example.org/api/summary', 'mvhs', { fetchImpl }),
    ).rejects.toBeInstanceOf(SummaryFetchError)
    expect(called).toBe(false)
  })

  it('stops reading a body that exceeds the cap, even without a content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const fetchImpl = (async () => new Response(stream, { status: 200 })) as unknown as typeof fetch

    await expect(
      fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', { fetchImpl, maxBytes: 4096 }),
    ).rejects.toThrow(/cap/)
  })

  // One verified school must not be able to serve another school's identity.
  it('rejects a response whose slug is not the one the registry expects', async () => {
    await expect(
      fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', {
        fetchImpl: respond({ ...SUMMARY, slug: 'someone-else' }),
      }),
    ).rejects.toThrow(/someone-else/)
  })

  it('rejects a body that is not a summary', async () => {
    await expect(
      fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', {
        fetchImpl: respond('<html>not json</html>'),
      }),
    ).rejects.toThrow(/JSON/)
  })

  it('reports a school that answers with an error status', async () => {
    await expect(
      fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', {
        fetchImpl: respond('', { status: 503 }),
      }),
    ).rejects.toThrow(/503/)
  })
})
