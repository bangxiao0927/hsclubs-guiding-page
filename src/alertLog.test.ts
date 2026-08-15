import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AlertLog } from './alertLog.js'

const path = async () => join(await mkdtemp(join(tmpdir(), 'hsclubs-alerts-')), 'alerts.json')

describe('AlertLog', () => {
  it('persists transitions newest first across a reopen', async () => {
    const file = await path()
    const log = await AlertLog.open(file)
    await log.append([{ slug: 'a', kind: 'failing', streak: 3, error: '503' }], '2026-01-01T00:00:00Z')
    await log.append([{ slug: 'a', kind: 'recovered', streak: 0, error: null }], '2026-01-02T00:00:00Z')

    expect((await AlertLog.open(file)).all().map((e) => e.kind)).toEqual(['recovered', 'failing'])
  })

  it('starts empty when the file is corrupt and writes a valid replacement', async () => {
    const file = await path()
    await writeFile(file, '{ no', 'utf8')
    const log = await AlertLog.open(file)

    expect(log.all()).toEqual([])
    await log.append([{ slug: 'a', kind: 'failing', streak: 3, error: null }])
    expect(JSON.parse(await readFile(file, 'utf8'))).toHaveLength(1)
  })

  it('keeps the latest 200 events rather than growing forever', async () => {
    const file = await path()
    const log = await AlertLog.open(file)
    for (let index = 0; index < 205; index++) {
      await log.append([{ slug: String(index), kind: 'recovered', streak: 0, error: null }])
    }

    expect(log.all()).toHaveLength(200)
    expect(log.all()[0]?.slug).toBe('204')
    expect(log.all()[199]?.slug).toBe('5')
  })
})