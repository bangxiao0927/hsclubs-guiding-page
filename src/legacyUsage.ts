/**
 * Counts how often the unversioned endpoints are read, so their retirement can be a decision made
 * on evidence rather than a guess.
 *
 * It records nothing about who read what: only a per-route count and the first and last time each
 * was seen. That is enough to answer "is anything still using the legacy path?" and carries no
 * user data, which is the only kind of metric this project keeps (see docs/BRIDGE_CONTRACT.md).
 */
export type UsageRoute = 'legacy-schools' | 'v1-schools'

export interface RouteUsage {
  count: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

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
}
