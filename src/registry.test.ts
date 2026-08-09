import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadRegistry, parseRegistry, pollableSchools, RegistryError } from './registry.js'

const entry = (overrides: Record<string, unknown> = {}) => ({
  slug: 'mvhs',
  summaryUrl: 'https://mvhs.example.org/api/summary',
  verification: { token: 'tok', verifiedAt: '2026-08-08T12:00:00Z', state: 'verified' },
  listed: true,
  ...overrides,
})

describe('parseRegistry', () => {
  it('reads a school entry', () => {
    expect(parseRegistry({ schools: [entry()] })[0]).toMatchObject({
      slug: 'mvhs',
      listed: true,
      verification: { state: 'verified' },
    })
  })

  // Adding a school means wanting it shown; forgetting the flag should not hide it.
  it('treats a missing listed flag as listed', () => {
    const [parsed] = parseRegistry({ schools: [entry({ listed: undefined })] })
    expect(parsed?.listed).toBe(true)
  })

  // Caught in configuration rather than on the wire: a mistake that only surfaces during a
  // fetch is a mistake that ships.
  it('rejects a non-https summary url', () => {
    expect(() =>
      parseRegistry({ schools: [entry({ summaryUrl: 'http://mvhs.example.org/api/summary' })] }),
    ).toThrow(RegistryError)
  })

  it.each([
    ['a malformed url', entry({ summaryUrl: 'not a url' })],
    ['an unknown verification state', entry({ verification: { state: 'maybe' } })],
    ['a slug with spaces', entry({ slug: 'mv hs' })],
    ['a slug with uppercase', entry({ slug: 'MVHS' })],
  ])('rejects %s', (_label, bad) => {
    expect(() => parseRegistry({ schools: [bad] })).toThrow(RegistryError)
  })

  // Two entries with one slug means one silently wins, and which one is undefined.
  it('rejects duplicate slugs', () => {
    expect(() => parseRegistry({ schools: [entry(), entry()] })).toThrow(/two schools/)
  })

  it('rejects a registry that is not an object with schools', () => {
    expect(() => parseRegistry([])).toThrow(RegistryError)
    expect(() => parseRegistry({ schools: {} })).toThrow(RegistryError)
  })
})

describe('pollableSchools', () => {
  it('polls only verified schools the operator has left listed', () => {
    const schools = parseRegistry({
      schools: [
        entry(),
        entry({ slug: 'pending-school', verification: { state: 'pending' } }),
        entry({ slug: 'failing-school', verification: { state: 'failing' } }),
        entry({ slug: 'unlisted-school', listed: false }),
      ],
    })

    expect(pollableSchools(schools).map((school) => school.slug)).toEqual(['mvhs'])
  })
})

describe('loadRegistry', () => {
  const write = async (contents: string) => {
    const path = join(await mkdtemp(join(tmpdir(), 'hsclubs-registry-')), 'registry.json')
    await writeFile(path, contents, 'utf8')
    return path
  }

  it('reads a registry from disk', async () => {
    const path = await write(JSON.stringify({ schools: [entry()] }))

    expect((await loadRegistry(path)).map((school) => school.slug)).toEqual(['mvhs'])
  })

  // This is operated from a Windows machine, where Notepad and PowerShell add a byte order mark
  // on save. Without this, editing the registry the obvious way makes the tool report "not valid
  // JSON", which reads like the operator's mistake rather than their editor's.
  it('reads a registry saved with a byte order mark', async () => {
    const path = await write(`\uFEFF${JSON.stringify({ schools: [entry()] })}`)

    expect((await loadRegistry(path)).map((school) => school.slug)).toEqual(['mvhs'])
  })

  it('says which file it could not read', async () => {
    await expect(loadRegistry('does-not-exist.json')).rejects.toThrow(/does-not-exist\.json/)
  })
})
