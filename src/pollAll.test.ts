import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { pollAllSchools } from './pollAll.js'
import type { SchoolEntry } from './registry.js'
import { SchoolStore } from './store.js'

const school = (slug: string, host = `${slug}.example.org`): SchoolEntry => ({
  slug,
  summaryUrl: `https://${host}/api/summary`,
  verification: { token: 't', verifiedAt: null, lastCheckedAt: null, lastError: null, state: 'verified' },
  listed: true,
})

const summaryFor = (slug: string) => ({
  schoolName: `${slug} High School`,
  shortName: slug.toUpperCase(),
  slug,
  address: null,
  status: 'active',
  clubCount: 3,
  categories: {},
  memberCount: 0,
  lastUpdatedAt: '2026-08-08T21:41:31-07:00',
  dataHash: 'hash',
})

const freshStore = async () =>
  SchoolStore.open(join(await mkdtemp(join(tmpdir(), 'hsclubs-pollall-')), 'schools.json'))

/** Answers per host, so one school can misbehave while the others do not. */
const fetchByHost = (
  handlers: Record<string, () => Response | Promise<Response>>,
): typeof fetch =>
  (async (url: URL) => {
    const handler = handlers[url.host]
    if (!handler) throw new Error(`unexpected host ${url.host}`)
    return handler()
  }) as unknown as typeof fetch

describe('pollAllSchools', () => {
  it('polls every school and reports what happened to each', async () => {
    const store = await freshStore()
    const report = await pollAllSchools([school('alpha'), school('beta')], store, {
      fetchImpl: fetchByHost({
        'alpha.example.org': () =>
          new Response(JSON.stringify(summaryFor('alpha')), { headers: { etag: '"a"' } }),
        'beta.example.org': () =>
          new Response(JSON.stringify(summaryFor('beta')), { headers: { etag: '"b"' } }),
      }),
    })

    expect(report).toMatchObject({ updated: 2, unchanged: 0, failed: 0 })
    expect(store.get('alpha').etag).toBe('"a"')
    expect(store.get('beta').etag).toBe('"b"')
  })

  // The point of the loop: schools are independent. A broken one must not cost the others their
  // poll, which is what a single try/catch around the whole pass would do.
  it('keeps polling after a school fails', async () => {
    const store = await freshStore()
    const report = await pollAllSchools(
      [school('broken'), school('fine')],
      store,
      {
        fetchImpl: fetchByHost({
          'broken.example.org': () => {
            throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') })
          },
          'fine.example.org': () =>
            new Response(JSON.stringify(summaryFor('fine')), { headers: { etag: '"f"' } }),
        }),
      },
    )

    expect(report).toMatchObject({ updated: 1, failed: 1 })
    expect(report.schools.map((entry) => entry.slug)).toEqual(['broken', 'fine'])
    expect(store.get('broken').lastError).toMatch(/ECONNREFUSED/)
    expect(store.get('fine').summary?.clubCount).toBe(3)
  })

  it('sends the stored etag per school, so an unchanged school costs a 304', async () => {
    const store = await freshStore()
    const conditional: Record<string, string | null> = {}
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      const sent = new Headers(init.headers).get('if-none-match')
      conditional[url.host] = sent
      return sent === '"a"'
        ? new Response(null, { status: 304 })
        : new Response(JSON.stringify(summaryFor('alpha')), { headers: { etag: '"a"' } })
    }) as unknown as typeof fetch

    const first = await pollAllSchools([school('alpha')], store, { fetchImpl })
    const second = await pollAllSchools([school('alpha')], store, { fetchImpl })

    expect(first.updated).toBe(1)
    expect(second.unchanged).toBe(1)
    expect(conditional['alpha.example.org']).toBe('"a"')
  })

  // A pass can be interrupted -- the machine sleeps, the process is stopped -- and what was
  // already learned should survive it.
  it('stores each school as it goes, not at the end of the pass', async () => {
    const store = await freshStore()
    let storedWhenSecondSchoolWasPolled: string | null = null

    await pollAllSchools([school('alpha'), school('beta')], store, {
      fetchImpl: fetchByHost({
        'alpha.example.org': () =>
          new Response(JSON.stringify(summaryFor('alpha')), { headers: { etag: '"a"' } }),
        'beta.example.org': () => {
          storedWhenSecondSchoolWasPolled = store.get('alpha').etag
          return new Response(JSON.stringify(summaryFor('beta')), { headers: { etag: '"b"' } })
        },
      }),
    })

    expect(storedWhenSecondSchoolWasPolled).toBe('"a"')
  })

  it('reports a school whose result could not be stored, and carries on', async () => {
    const store = await freshStore()
    const failing = {
      get: store.get.bind(store),
      put: async () => {
        throw new Error('disk full')
      },
    } as unknown as SchoolStore

    const report = await pollAllSchools([school('alpha'), school('beta')], failing, {
      fetchImpl: fetchByHost({
        'alpha.example.org': () => new Response(JSON.stringify(summaryFor('alpha'))),
        'beta.example.org': () => new Response(JSON.stringify(summaryFor('beta'))),
      }),
    })

    expect(report.failed).toBe(2)
    expect(report.schools[0]?.error).toMatch(/disk full/)
  })
})
