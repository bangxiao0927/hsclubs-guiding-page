import { pollableSchools, type SchoolEntry } from './registry.js'
import type { SchoolStore, SchoolRecord } from './store.js'

/** A record plus where a visitor should be sent: this page's whole point is the hand-off. */
export interface PageSchool {
  record: SchoolRecord
  /** Origin of the school's own site, derived from its verified summary URL. */
  siteUrl: string
  /** A fixture for exercising the UI, not a participating school. */
  demo?: boolean
}

/**
 * The records the page is allowed to render, in registry order.
 *
 * The store is only a cache and may still contain a school the operator unlisted, or one whose
 * challenge was removed and whose verification state is now failing. Rendering `store.all()`
 * would keep that school visible forever even though verification correctly stopped polling it.
 * The registry is the authority for visibility; `store.get` also supplies an empty record for a
 * newly verified school, so the page says "No data yet" rather than omitting it silently.
 */
export const pageSchools = (entries: SchoolEntry[], store: SchoolStore): PageSchool[] =>
  pollableSchools(entries).map((entry) => ({
    record: store.get(entry.slug),
    // The origin only, never the registry's full summary path: a visitor is being sent to the
    // school's front page, and that origin is the one verification proved control of.
    siteUrl: new URL(entry.summaryUrl).origin,
    demo: entry.demo === true,
  }))
