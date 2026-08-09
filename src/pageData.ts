import { pollableSchools, type SchoolEntry } from './registry.js'
import type { SchoolStore, SchoolRecord } from './store.js'

/**
 * The records the page is allowed to render, in registry order.
 *
 * The store is only a cache and may still contain a school the operator unlisted, or one whose
 * challenge was removed and whose verification state is now failing. Rendering `store.all()`
 * would keep that school visible forever even though verification correctly stopped polling it.
 * The registry is the authority for visibility; `store.get` also supplies an empty record for a
 * newly verified school, so the page says "No data yet" rather than omitting it silently.
 */
export const pageRecords = (entries: SchoolEntry[], store: SchoolStore): SchoolRecord[] =>
  pollableSchools(entries).map((entry) => store.get(entry.slug))
