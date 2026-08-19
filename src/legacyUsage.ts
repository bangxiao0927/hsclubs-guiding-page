import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Counts how often the unversioned endpoints are read, so their retirement can be a decision made
 * on evidence rather than a guess.
 *
 * It records nothing about who read what: only a per-route count and the first and last time each
 * was seen. That is enough to answer "is anything still using the legacy path?" and carries no
 * user data, which is the only kind of metric this project keeps (see docs/BRIDGE_CONTRACT.md).
 *
 * Persisted to a JSON file so the counts survive a restart: an observation window is measured in
 * weeks, and a metric that reset on every deploy could not show that the legacy path had gone
 * quiet. The counter loads what was there and only ever adds to it.
 */
export type UsageRoute = 'legacy-schools' | 'v1-schools'

export interface RouteUsage {
  count: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

const isRoute = (value: string): value is UsageRoute =>
  value === 'legacy-schools' || value === 'v1-schools'

export class LegacyUsage {
  private readonly usage = new Map<UsageRoute, RouteUsage>()

  record(route: UsageRoute, now: () => Date = () => new Date()): void {
    const at = now().toISOString()
    const current = this.usage.get(route)
    if (current) {
      current.count += 1
      current.lastSeenAt = at
    } else {
      this.usage.set(route, { count: 1, firstSeenAt: at, lastSeenAt: at })
    }
  }

  snapshot(): Record<UsageRoute, RouteUsage> {
    const empty: RouteUsage = { count: 0, firstSeenAt: null, lastSeenAt: null }
    return {
      'legacy-schools': this.usage.get('legacy-schools') ?? empty,
      'v1-schools': this.usage.get('v1-schools') ?? empty,
    }
  }

  /** Replaces the in-memory counts, e.g. from a persisted file on startup. */
  restore(snapshot: Partial<Record<UsageRoute, RouteUsage>>): void {
    for (const [route, value] of Object.entries(snapshot)) {
      if (isRoute(route) && value && typeof value.count === 'number' && value.count >= 0) {
        this.usage.set(route, {
          count: value.count,
          firstSeenAt: typeof value.firstSeenAt === 'string' ? value.firstSeenAt : null,
          lastSeenAt: typeof value.lastSeenAt === 'string' ? value.lastSeenAt : null,
        })
      }
    }
  }

  /**
   * Loads persisted counts, or returns an empty counter when the file is missing or unreadable.
   *
   * A corrupt metrics file is never fatal: it is a coarse adoption signal, not operational state,
   * so a bad read simply starts the counts fresh rather than refusing to serve.
   */
  static async open(path: string): Promise<LegacyUsage> {
    const usage = new LegacyUsage()
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
      if (raw && typeof raw === 'object') {
        usage.restore(raw as Partial<Record<UsageRoute, RouteUsage>>)
      }
    } catch {
      // Missing or corrupt: start clean.
    }
    return usage
  }

  /** Atomically writes the current counts, so a crash mid-write cannot corrupt the file. */
  async persist(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = join(dirname(path), `.${Date.now()}-${process.pid}.usage.tmp`)
    await writeFile(temporary, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }
}
