import { pollableSchools, type SchoolEntry } from './registry.js'
import type { SchoolStore } from './store.js'

/**
 * The minimal school directory the iOS app reads at `GET /api/v1/schools`.
 *
 * Narrower than the browser payload behind `/api/schools` on purpose: an app needs to list
 * schools and open one, so it gets identity, a display name, the verified origin, the host, the
 * mobile-auth capability and a status -- and none of the history, trend or category breakdown
 * the web page draws. Coupling the app to fields it does not render is how a later change to one
 * of them turns into an app release.
 *
 * The governing rule is isolation: one school's bad configuration or corrupt record marks *that*
 * school incompatible and leaves it in the list as not-openable, and never removes or fails any
 * other school. See contracts/v1/README.md and contracts/v1/schemas/app-directory.schema.json.
 */
export type IntegrationStatus = 'compatible' | 'degraded' | 'incompatible'

export interface AppDirectorySchool {
  schoolId: string
  slug: string
  name: string
  shortName: string | null
  siteOrigin: string
  host: string
  demo: boolean
  integrationStatus: IntegrationStatus
  unavailableReason: string | null
  clubCount: number | null
  lastUpdatedAt: string | null
  mobileAuth: boolean
}

export interface AppDirectory {
  contract: 'hsclubs.app-directory'
  version: 1
  generatedAt: string
  schools: AppDirectorySchool[]
}

export interface AppDirectoryOptions {
  now?: Date
  /** A defensive ceiling; a directory this size is a misconfiguration, not a school count. */
  maxSchools?: number
}

const DEFAULT_MAX_SCHOOLS = 1000

/**
 * Manifest states that leave a school openable but not fully confirmed.
 *
 * A school that is verified and identified but whose manifest has not been read cleanly yet is
 * `degraded`, not `incompatible`: the app can still open its site, it simply cannot rely on the
 * v1 extras. During the migration this is the ordinary state of a school that upgraded its
 * summary before its manifest, so treating it as a fault would empty the directory of real
 * schools.
 */
const DEGRADED_STATES = new Set(['absent', 'unreachable', 'slug-mismatch'])

/**
 * Manifest states where opening the school would carry a mistake into the app.
 *
 * `id-mismatch` and `origin-mismatch` mean an origin is claiming an identity or a home that is
 * not its own; `invalid` means its manifest did not honour the contract. None of these should
 * become an openable row.
 */
const INCOMPATIBLE_STATES = new Map<string, string>([
  ['id-mismatch', 'the school publishes an identity that is not the one it was issued'],
  ['origin-mismatch', 'the school publishes an origin off its verified host'],
  ['invalid', 'the school manifest did not match the v1 contract'],
  ['id-missing', 'the school has not been issued an identity'],
])

interface Classification {
  status: IntegrationStatus
  reason: string | null
}

const classify = (entry: SchoolEntry): Classification => {
  // Verification is the outer gate: a school the challenge or summary check disproved is not
  // openable regardless of what its manifest last said.
  if (entry.verification.state === 'failing') {
    return { status: 'incompatible', reason: 'the school could not be verified' }
  }

  const integration = entry.integration
  if (!integration || integration.state === 'ok') {
    return { status: integration ? 'compatible' : 'degraded', reason: null }
  }
  const incompatibleReason = INCOMPATIBLE_STATES.get(integration.state)
  if (incompatibleReason) {
    return { status: 'incompatible', reason: incompatibleReason }
  }
  if (DEGRADED_STATES.has(integration.state)) {
    return { status: 'degraded', reason: null }
  }
  // An unknown future state is treated as degraded, not incompatible: refusing to open a school
  // because this code has not learned a new diagnostic word yet would be the wrong default.
  return { status: 'degraded', reason: null }
}

/**
 * Builds one school row, or throws so the caller can isolate it.
 *
 * Throwing rather than returning a status keeps the "corrupt record" path -- a summary URL that
 * will not parse, a record shaped in a way this code did not expect -- in one place, where it is
 * turned into an incompatible row instead of an exception that would fail the whole response.
 */
const buildSchool = (entry: SchoolEntry, store: SchoolStore): AppDirectorySchool => {
  const schoolId = entry.schoolId
  if (schoolId === undefined) {
    throw new Error('school has no identity')
  }
  const origin = new URL(entry.summaryUrl).origin
  const host = new URL(origin).host
  const record = store.get(entry.slug)
  const summary = record.summary

  const { status, reason } = classify(entry)
  const openable = status !== 'incompatible'

  return {
    schoolId,
    slug: entry.slug,
    // A school whose summary never loaded has no name to show; fall back to the slug, which is
    // this page's own text, never anything the failing school chose.
    name: summary?.schoolName ?? entry.slug,
    shortName: summary?.shortName ?? null,
    siteOrigin: origin,
    host,
    demo: entry.demo === true,
    integrationStatus: status,
    unavailableReason: reason,
    // Numbers are only offered when the school is openable and has a summary: a not-openable row
    // must not carry data the app might show as if the school were live.
    clubCount: openable ? summary?.clubCount ?? null : null,
    lastUpdatedAt: openable ? summary?.lastUpdatedAt ?? null : null,
    // Mobile auth is offered only when the manifest confirmed it and the school is compatible:
    // sending someone into a sign-in a degraded or unavailable school cannot complete is worse
    // than not offering it.
    mobileAuth: status === 'compatible' && entry.integration?.mobileAuth === true,
  }
}

/**
 * Assembles the app directory from the registry and the store.
 *
 * Only listed schools that have been issued an identity appear: a school with no `schoolId` has
 * no stable key for the app to remember, so it stays off the v1 surface until one is issued --
 * which is exactly what keeps the migration incremental. Order follows the registry, so the list
 * is stable across requests.
 */
export const buildAppDirectory = (
  entries: SchoolEntry[],
  store: SchoolStore,
  { now = new Date(), maxSchools = DEFAULT_MAX_SCHOOLS }: AppDirectoryOptions = {},
): AppDirectory => {
  const listedWithIdentity = entries.filter(
    (entry) => entry.listed && entry.schoolId !== undefined,
  )

  const schools: AppDirectorySchool[] = []
  for (const entry of listedWithIdentity.slice(0, maxSchools)) {
    try {
      schools.push(buildSchool(entry, store))
    } catch {
      // The record itself is unusable. Keep the school in the directory as not-openable so a
      // configuration mistake is visible rather than a school silently vanishing, and say only
      // what this page knows -- never anything the school sent.
      if (entry.schoolId !== undefined) {
        schools.push(incompatibleFromEntry(entry))
      }
    }
  }
  return { contract: 'hsclubs.app-directory', version: 1, generatedAt: now.toISOString(), schools }
}

/** The most conservative row we can still describe when building the normal one threw. */
const incompatibleFromEntry = (entry: SchoolEntry): AppDirectorySchool => {
  let origin: string
  let host: string
  try {
    origin = new URL(entry.summaryUrl).origin
    host = new URL(origin).host
  } catch {
    // Even the URL is unusable; publish placeholders rather than fail the response. The app
    // shows the row as unavailable and never navigates to it.
    origin = 'https://invalid.invalid'
    host = 'invalid.invalid'
  }
  return {
    schoolId: entry.schoolId as string,
    slug: entry.slug,
    name: entry.slug,
    shortName: null,
    siteOrigin: origin,
    host,
    demo: entry.demo === true,
    integrationStatus: 'incompatible',
    unavailableReason: 'the school record could not be read',
    clubCount: null,
    lastUpdatedAt: null,
    mobileAuth: false,
  }
}

// Re-exported so a caller assembling the page and the directory from the same read does not have
// to import the registry filter separately.
export { pollableSchools }
