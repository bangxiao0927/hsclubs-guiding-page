import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { SchoolSummary } from './summary.js'

/**
 * What this page knows about each school, between runs.
 *
 * A JSON file, because there are a handful of schools on one machine (docs/ROADMAP.md). It holds
 * the last good summary, the ETag to poll with, and the last error -- so a stale card on the
 * page can always be explained rather than just being old.
 */
export interface SchoolRecord {
  slug: string
  summary: SchoolSummary | null
  etag: string | null
  lastPolledAt: string | null
  lastUpdatedAt: string | null
  lastError: string | null
}

export type StoreContents = Record<string, SchoolRecord>

export const emptyRecord = (slug: string): SchoolRecord => ({
  slug,
  summary: null,
  etag: null,
  lastPolledAt: null,
  lastUpdatedAt: null,
  lastError: null,
})

export class SchoolStore {
  private constructor(
    private readonly path: string,
    private contents: StoreContents,
  ) {}

  static async open(path: string): Promise<SchoolStore> {
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
      const contents = typeof raw === 'object' && raw !== null ? (raw as StoreContents) : {}
      return new SchoolStore(path, contents)
    } catch {
      // A missing or unreadable store is not a failure: this is a cache of other people's data,
      // and the next poll rebuilds it. Refusing to start would turn a corrupt file into an
      // outage of the whole page.
      return new SchoolStore(path, {})
    }
  }

  get(slug: string): SchoolRecord {
    return this.contents[slug] ?? emptyRecord(slug)
  }

  all(): SchoolRecord[] {
    return Object.values(this.contents)
  }

  async put(record: SchoolRecord): Promise<void> {
    this.contents[record.slug] = record
    await this.flush()
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    // Written beside the target and renamed, so a crash mid-write leaves the previous file
    // intact rather than a half-written one the next run would discard.
    const temporary = join(dirname(this.path), `.${Date.now()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(this.contents, null, 2)}\n`, 'utf8')
    await rename(temporary, this.path)
  }
}
