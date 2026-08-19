import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { LegacyUsage } from './legacyUsage.js'

describe('LegacyUsage', () => {
  it('counts reads per route and remembers first and last, with no user data', () => {
    const usage = new LegacyUsage()
    const clock = ['2026-08-18T00:00:00.000Z', '2026-08-18T01:00:00.000Z'].map((s) => new Date(s))
    let i = 0
    const now = () => clock[i++]!

    usage.record('legacy-schools', now)
    usage.record('legacy-schools', now)

    const snapshot = usage.snapshot()
    expect(snapshot['legacy-schools']).toEqual({
      count: 2,
      firstSeenAt: '2026-08-18T00:00:00.000Z',
      lastSeenAt: '2026-08-18T01:00:00.000Z',
    })
    // A route never hit reports zero rather than being absent, so the metric is always complete.
    expect(snapshot['v1-schools']).toEqual({ count: 0, firstSeenAt: null, lastSeenAt: null })
    // The shape carries counts and timestamps only.
    expect(Object.keys(snapshot['legacy-schools'])).toEqual(['count', 'firstSeenAt', 'lastSeenAt'])
  })

  it('survives a restart by loading and adding to the persisted counts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hsclubs-usage-'))
    const path = join(dir, 'usage.json')

    const first = new LegacyUsage()
    first.record('legacy-schools')
    await first.persist(path)

    // A fresh process loads the file and keeps counting from where it left off.
    const second = await LegacyUsage.open(path)
    second.record('legacy-schools')
    expect(second.snapshot()['legacy-schools'].count).toBe(2)

    // The persisted file is JSON with no user data, only counts and timestamps.
    const onDisk = JSON.parse(await readFile(path, 'utf8'))
    expect(Object.keys(onDisk['legacy-schools'])).toEqual(['count', 'firstSeenAt', 'lastSeenAt'])
  })

  it('starts clean when the persisted file is missing or corrupt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hsclubs-usage-'))
    expect((await LegacyUsage.open(join(dir, 'absent.json'))).snapshot()['v1-schools'].count).toBe(0)

    const corrupt = join(dir, 'corrupt.json')
    await writeFile(corrupt, 'not json', 'utf8')
    expect((await LegacyUsage.open(corrupt)).snapshot()['legacy-schools'].count).toBe(0)
  })
})
