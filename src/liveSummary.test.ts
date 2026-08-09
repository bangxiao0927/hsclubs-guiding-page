import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { fetchSummary } from './fetchSummary.js'
import { parseSummary } from './summary.js'

/**
 * The fixture is a real response body, captured verbatim from a running HSclubs instance rather
 * than written by hand here. Hand-written fixtures only ever prove that the parser agrees with
 * whoever wrote them; this one fails if the producer's actual shape drifts from what this repo
 * expects.
 */
const liveBody = async () =>
  readFile(fileURLToPath(new URL('./fixtures/live-summary.json', import.meta.url)), 'utf8')

describe('a real response from a school site', () => {
  it('parses into the fields this page shows', async () => {
    const summary = parseSummary(JSON.parse(await liveBody()))

    expect(summary).toMatchObject({
      slug: 'mvhs',
      schoolName: 'Mountain View High School',
      shortName: 'MVHS',
      address: '3535 Truman Ave, Mountain View, CA 94040',
      status: 'active',
      clubCount: 106,
      memberCount: 0,
    })
    expect(summary.categories['STEM & Innovation']).toBe(15)
    expect(summary.lastUpdatedAt).toMatch(/[+-]\d{2}:\d{2}$/)
  })

  // Phase 1's exit check (docs/ROADMAP.md), against the producer's own bytes: the first poll
  // stores an etag, and a second poll carrying it is answered without a body.
  it('costs one 200 and then one 304', async () => {
    const body = await liveBody()
    const etag = '"03a95d47b9ca1ffab3a1289489143f119c7471b6e10cdc755c18c4db29a5d8b2"'
    const seen: (string | null)[] = []

    const fetchImpl = (async (_url: URL, init: RequestInit) => {
      const conditional = new Headers(init.headers).get('if-none-match')
      seen.push(conditional)
      return conditional === etag
        ? new Response(null, { status: 304 })
        : new Response(body, { status: 200, headers: { etag } })
    }) as unknown as typeof fetch

    const first = await fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', { fetchImpl })
    expect(first.outcome).toBe('updated')
    if (first.outcome !== 'updated') throw new Error('unreachable')

    const second = await fetchSummary('https://mvhs.example.org/api/summary', 'mvhs', {
      fetchImpl,
      etag: first.etag,
    })

    expect(second.outcome).toBe('not-modified')
    expect(seen).toEqual([null, etag])
  })
})
