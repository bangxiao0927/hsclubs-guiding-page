import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  loadRegistry,
  parseRegistry,
  pollableSchools,
  RegistryError,
  saveRegistry,
  withRegistryLock,
} from './registry.js'

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

  it('only marks an entry as a demo when the operator explicitly says true', () => {
    expect(parseRegistry({ schools: [entry({ demo: true })] })[0]?.demo).toBe(true)
    expect(parseRegistry({ schools: [entry()] })[0]?.demo).toBe(false)
    expect(parseRegistry({ schools: [entry({ demo: 'yes' })] })[0]?.demo).toBe(false)
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

  it('round-trips verification state through an atomic save', async () => {
    const path = await write(JSON.stringify({ schools: [entry()] }))
    const entries = await loadRegistry(path)
    entries[0]!.verification = {
      ...entries[0]!.verification,
      state: 'failing',
      lastCheckedAt: '2026-08-09T12:00:00Z',
      lastError: 'Challenge answered 404',
    }

    await saveRegistry(path, entries)

    expect((await loadRegistry(path))[0]?.verification).toMatchObject({
      state: 'failing',
      lastCheckedAt: '2026-08-09T12:00:00Z',
      lastError: 'Challenge answered 404',
    })
  })

  it('preserves top-level and per-school fields it does not understand', async () => {
    const original = {
      _comment: ['operator note'],
      futureTopLevel: { version: 2 },
      schools: [
        {
          ...entry(),
          contactNote: 'Talk to the activities office',
          verification: { ...entry().verification, futureProof: 'keep me' },
        },
      ],
    }
    const path = await write(JSON.stringify(original))
    const entries = await loadRegistry(path)
    entries[0]!.verification.lastError = 'temporary error'

    await saveRegistry(path, entries)

    const saved = JSON.parse(await readFile(path, 'utf8')) as typeof original
    expect(saved._comment).toEqual(['operator note'])
    expect(saved.futureTopLevel).toEqual({ version: 2 })
    expect(saved.schools[0]?.contactNote).toBe('Talk to the activities office')
    expect(saved.schools[0]?.verification.futureProof).toBe('keep me')
  })

  it('allows one registry mutation at a time and removes the lock afterwards', async () => {
    const path = await write(JSON.stringify({ schools: [entry()] }))
    let release!: () => void
    let entered!: () => void
    const operationEntered = new Promise<void>((resolve) => (entered = resolve))
    const held = withRegistryLock(
      path,
      () =>
        new Promise<void>((resolve) => {
          release = resolve
          entered()
        }),
    )
    await operationEntered

    await expect(withRegistryLock(path, async () => undefined)).rejects.toThrow(/registry is busy/)
    release()
    await held
    await expect(withRegistryLock(path, async () => 'ok')).resolves.toBe('ok')
  })
})
