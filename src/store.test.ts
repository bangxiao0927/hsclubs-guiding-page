import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { emptyRecord, SchoolStore } from './store.js'

const temporaryStore = async () => join(await mkdtemp(join(tmpdir(), 'hsclubs-store-')), 'schools.json')

describe('SchoolStore', () => {
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

    const store = await SchoolStore.open(path)

    expect(store.all()).toEqual([])
    await store.put(emptyRecord('mvhs'))
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty('mvhs')
  })
})
