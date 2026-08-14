import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { emptyRecord, SchoolStore } from './store.js'

const temporaryStore = async () => join(await mkdtemp(join(tmpdir(), 'hsclubs-store-')), 'schools.json')

const summary = {
  schoolName: 'Mountain View High School',
  shortName: 'MVHS',
  slug: 'mvhs',
  address: null,
  status: 'active',
  clubCount: 106,
  categories: { STEM: 15 },
  memberCount: 0,
  lastUpdatedAt: '2026-08-09T04:00:00-07:00',
  dataHash: 'hash',
}

describe('SchoolStore', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates the file on first write and reads it back', async () => {
    const path = await temporaryStore()
    const store = await SchoolStore.open(path)

    await store.put({ ...emptyRecord('mvhs'), etag: '"abc123"' })

    const reopened = await SchoolStore.open(path)
    expect(reopened.get('mvhs').etag).toBe('"abc123"')
    expect(reopened.all()).toHaveLength(1)
  })

  it('returns an empty record for a school it has never seen', async () => {
    const store = await SchoolStore.open(await temporaryStore())

    expect(store.get('unknown')).toEqual(emptyRecord('unknown'))
  })

  // This file is a cache of other people's data. Refusing to start because it is corrupt would
  // turn a bad file into an outage of the whole page; the next poll rebuilds it.
  it('starts empty rather than throwing when the file is corrupt', async () => {
    const path = await temporaryStore()
    await writeFile(path, '{ not json', 'utf8')

    const complained = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = await SchoolStore.open(path)

    expect(store.all()).toEqual([])
    // An empty page with no explanation is the one failure an operator cannot diagnose.
    expect(complained).toHaveBeenCalled()
    await store.put(emptyRecord('mvhs'))
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty('mvhs')
  })

  // Windows editors and PowerShell add one by default; without stripping it the whole store
  // parses as nothing and every school silently shows "No data yet".
  it('reads a store saved with a byte order mark', async () => {
    const path = await temporaryStore()
    await writeFile(path, `\uFEFF${JSON.stringify({ mvhs: { slug: 'mvhs', summary } })}`, 'utf8')

    const store = await SchoolStore.open(path)

    expect(store.get('mvhs').summary?.clubCount).toBe(106)
  })

  // The renderer trusts these shapes. One bad record must cost that school its card, not the
  // whole page.
  it('degrades an unreadable record to a school with no data', async () => {
    const path = await temporaryStore()
    await writeFile(
      path,
      JSON.stringify({
        broken: { slug: 'broken', summary: { ...summary, categories: null, clubCount: 'many' } },
        fine: { slug: 'fine', summary },
      }),
      'utf8',
    )

    const store = await SchoolStore.open(path)

    expect(store.get('broken').summary).toBeNull()
    expect(store.get('broken').lastError).toContain('Stored summary was unreadable')
    expect(store.get('fine').summary?.clubCount).toBe(106)
  })
})
