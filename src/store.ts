import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { parseSummary, type SchoolSummary } from './summary.js'

/**
 * What this page knows about each school, between runs.
 *
 * A JSON file, because there are a handful of schools on one machine (docs/ROADMAP.md). It holds
 * the last good summary, the ETag to poll with, and the last error -- so a stale card on the
 * page can always be explained rather than just being old.
 */
/** One observation of a school's club count, kept so the page can show a trend. */
export interface HistoryPoint {
  at: string
  clubCount: number
}

export interface SchoolRecord {
  slug: string
  summary: SchoolSummary | null
  etag: string | null
  lastPolledAt: string | null
  lastUpdatedAt: string | null
  lastError: string | null
  /**
   * Consecutive failed polls, reset by any success.
   *
   * A count rather than a boolean: one failed poll is a school restarting, and alerting on it
   * would train an operator to ignore the alert. The threshold lives with the alerting, not
   * here.
   */
  failureStreak: number
  /**
   * Club counts over time, appended only when the number actually changes.
   *
   * A directory that changes weekly polled hourly would otherwise write 168 identical points a
   * week, and the store is a JSON file read whole on every request.
   */
  history: HistoryPoint[]
}

export type StoreContents = Record<string, SchoolRecord>

export const emptyRecord = (slug: string): SchoolRecord => ({
  slug,
  summary: null,
  etag: null,
  lastPolledAt: null,
  lastUpdatedAt: null,
  lastError: null,
  failureStreak: 0,
  history: [],
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** A malformed point is dropped rather than failing the record: history is the least important
 *  thing on the card, and losing a chart must never lose a school. */
const parseHistory = (value: unknown): HistoryPoint[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((point) => {
    if (!isRecord(point)) return []
    const at = point['at']
    const clubCount = point['clubCount']
    if (typeof at !== 'string' || typeof clubCount !== 'number' || !Number.isFinite(clubCount)) {
      return []
    }
    return [{ at, clubCount }]
  })
}

/**
 * Strips a UTF-8 byte order mark, as the registry loader does.
 *
 * This job is operated from Windows, where opening the store in Notepad or rewriting it from
 * PowerShell adds one. Without this the whole file fails to parse, the store silently starts
 * empty, and the page says "No data yet" for every school with no hint that a stray byte -- not
 * the poller -- is the reason.
 */
const withoutByteOrderMark = (contents: string): string =>
  contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents

/**
 * Re-checks a stored record against the producer contract on the way in.
 *
 * The store is a file on disk that an operator can edit and a crash can truncate; the renderer
 * assumes the shapes this type promises. One unreadable record degrades to that school's "No
 * data yet" card, which is a card the page already knows how to draw -- rather than throwing
 * mid-render and turning the whole page into a 500.
 */
const parseRecord = (slug: string, raw: unknown): SchoolRecord => {
  if (!isRecord(raw)) return emptyRecord(slug)

  const streak = raw['failureStreak']
  const base: SchoolRecord = {
    slug,
    summary: null,
    etag: optionalString(raw['etag']),
    lastPolledAt: optionalString(raw['lastPolledAt']),
    lastUpdatedAt: optionalString(raw['lastUpdatedAt']),
    lastError: optionalString(raw['lastError']),
    failureStreak: typeof streak === 'number' && Number.isInteger(streak) && streak >= 0 ? streak : 0,
    history: parseHistory(raw['history']),
  }
  if (raw['summary'] === undefined || raw['summary'] === null) return base

  try {
    return { ...base, summary: parseSummary(raw['summary']) }
  } catch (error) {
    return {
      ...base,
      lastError: `Stored summary was unreadable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

export class SchoolStore {
  private constructor(
    private readonly path: string,
    private contents: StoreContents,
  ) {}

  static async open(path: string): Promise<SchoolStore> {
    let raw: unknown
    try {
      raw = JSON.parse(withoutByteOrderMark(await readFile(path, 'utf8')))
    } catch (error) {
      // A missing or unreadable store is not a failure: this is a cache of other people's data,
      // and the next poll rebuilds it. Refusing to start would turn a corrupt file into an
      // outage of the whole page. Say so once, though: an empty page with no explanation is the
      // one failure an operator cannot diagnose.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Ignoring an unreadable store at ${path}: ${String(error)}`)
      }
      return new SchoolStore(path, {})
    }

    if (!isRecord(raw)) {
      console.error(`Ignoring a store at ${path} that is not a JSON object`)
      return new SchoolStore(path, {})
    }

    const contents: StoreContents = {}
    for (const [slug, value] of Object.entries(raw)) {
      contents[slug] = parseRecord(slug, value)
    }
    return new SchoolStore(path, contents)
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
