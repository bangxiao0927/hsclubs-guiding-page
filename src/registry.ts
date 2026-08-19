import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { isSchoolId, SCHOOL_ID_PATTERN } from './schoolId.js'

/**
 * The school list, as described in docs/REGISTRY.md.
 *
 * The operated file is not in git: it carries verification tokens and the exact URL of every
 * participating school. This module only reads and validates it -- a malformed registry has to
 * fail loudly at startup rather than silently poll nothing.
 */
export type VerificationState = 'pending' | 'verified' | 'failing'

export interface SchoolEntry {
  slug: string
  /**
   * The permanent identity this registry issued, or absent for a school that predates it.
   *
   * Absent is a supported state during the migration: a school with no id is polled and listed
   * exactly as before, it simply cannot appear on the v1 app surface yet. Once issued, the value
   * never changes -- see docs/REGISTRY.md and contracts/v1/README.md.
   */
  schoolId?: string
  summaryUrl: string
  verification: {
    token: string | null
    verifiedAt: string | null
    lastCheckedAt: string | null
    lastError: string | null
    state: VerificationState
  }
  listed: boolean
  /**
   * What the last identity check saw at this school's `/.well-known/hsclubs-app.json`.
   *
   * Kept beside verification because it is the same kind of thing -- operational state an
   * operator acts on -- but deliberately separate from it: verification answers "does this
   * origin belong to this school", the manifest answers "which identity and which contracts does
   * that origin publish". A school can be verified and not yet upgraded, and that is normal
   * during the migration rather than a fault.
   */
  integration?: {
    checkedAt: string | null
    /** 'ok', or the ManifestProblem from src/manifest.ts. */
    state: string
    detail: string | null
    /** Whether the manifest declared mobile authentication support, when it was readable. */
    mobileAuth?: boolean
  }
  /**
   * A fixture used to exercise the multi-school UI, not a participating school.
   *
   * Verification proves control of an origin; it does not prove that a made-up name belongs to
   * a real school. Keeping that distinction in the registry prevents a technically verified
   * fixture from being presented as institutionally approved.
   */
  demo?: boolean
  /**
   * Where the school is, when the operator has confirmed it.
   *
   * Not derived from the summary: `/api/summary` carries no coordinates, `address` is often
   * null, and geocoding free text would put a guessed pin on a real institution. Absent is a
   * supported state; the map says so rather than inventing a location.
   */
  location?: { lat: number; lon: number }
}

export class RegistryError extends Error {}

const VERIFICATION_STATES: readonly VerificationState[] = ['pending', 'verified', 'failing']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseEntry = (raw: unknown, index: number): SchoolEntry => {
  const where = `schools[${index}]`
  if (!isRecord(raw)) throw new RegistryError(`${where} must be an object`)

  const slug = raw['slug']
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(slug)) {
    throw new RegistryError(`${where}.slug must be lowercase letters, digits or hyphens`)
  }

  const schoolId = raw['schoolId']
  if (schoolId !== undefined && schoolId !== null && !isSchoolId(schoolId)) {
    throw new RegistryError(`${where}.schoolId must match ${SCHOOL_ID_PATTERN.source}`)
  }

  const summaryUrl = raw['summaryUrl']
  if (typeof summaryUrl !== 'string') {
    throw new RegistryError(`${where}.summaryUrl must be a string`)
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(summaryUrl)
  } catch {
    throw new RegistryError(`${where}.summaryUrl is not a URL: ${summaryUrl}`)
  }
  // Refused here rather than at fetch time: an http:// entry is a registry mistake, and a
  // mistake that only surfaces on the wire is one that ships.
  if (parsedUrl.protocol !== 'https:') {
    throw new RegistryError(`${where}.summaryUrl must be https, got ${parsedUrl.protocol}`)
  }

  const verification = isRecord(raw['verification']) ? raw['verification'] : {}
  const state = verification['state']
  if (typeof state !== 'string' || !VERIFICATION_STATES.includes(state as VerificationState)) {
    throw new RegistryError(
      `${where}.verification.state must be one of ${VERIFICATION_STATES.join(', ')}`,
    )
  }

  const token = verification['token']
  const verifiedAt = verification['verifiedAt']
  const lastCheckedAt = verification['lastCheckedAt']
  const lastError = verification['lastError']
  const listed = raw['listed']
  const demo = raw['demo']
  const location = parseLocation(raw['location'], where)
  const integration = isRecord(raw['integration']) ? raw['integration'] : null

  return {
    slug,
    ...(isSchoolId(schoolId) ? { schoolId } : {}),
    summaryUrl,
    verification: {
      token: typeof token === 'string' ? token : null,
      verifiedAt: typeof verifiedAt === 'string' ? verifiedAt : null,
      lastCheckedAt: typeof lastCheckedAt === 'string' ? lastCheckedAt : null,
      lastError: typeof lastError === 'string' ? lastError : null,
      state: state as VerificationState,
    },
    // Absent means listed: a school is added to be shown, and forgetting the flag should not
    // silently hide it.
    listed: listed === undefined ? true : listed === true,
    demo: demo === true,
    ...(location ? { location } : {}),
    ...(integration && typeof integration['state'] === 'string'
      ? {
          integration: {
            checkedAt:
              typeof integration['checkedAt'] === 'string' ? integration['checkedAt'] : null,
            state: integration['state'],
            detail: typeof integration['detail'] === 'string' ? integration['detail'] : null,
            ...(typeof integration['mobileAuth'] === 'boolean'
              ? { mobileAuth: integration['mobileAuth'] }
              : {}),
          },
        }
      : {}),
  }
}

/** @throws RegistryError for a malformed pair; a wrong pin is worse than no pin. */
const parseLocation = (
  raw: unknown,
  where: string,
): { lat: number; lon: number } | null => {
  if (raw === undefined || raw === null) return null
  if (!isRecord(raw)) throw new RegistryError(`${where}.location must be an object`)
  const lat = raw['lat']
  const lon = raw['lon']
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RegistryError(`${where}.location.lat must be a number between -90 and 90`)
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RegistryError(`${where}.location.lon must be a number between -180 and 180`)
  }
  return { lat, lon }
}

export const parseRegistry = (raw: unknown): SchoolEntry[] => {
  if (!isRecord(raw)) throw new RegistryError('registry must be a JSON object')
  const schools = raw['schools']
  if (!Array.isArray(schools)) throw new RegistryError('registry.schools must be an array')

  const entries = schools.map(parseEntry)
  const seen = new Set<string>()
  const seenIds = new Map<string, string>()
  for (const entry of entries) {
    if (seen.has(entry.slug)) {
      throw new RegistryError(`registry has two schools with the slug ${entry.slug}`)
    }
    seen.add(entry.slug)
    // Two schools sharing an identity is worse than a missing one: every consumer keys caches,
    // stored selections and sessions on it, so the collision has to stop the load rather than
    // become whichever school was polled last.
    if (entry.schoolId !== undefined) {
      const owner = seenIds.get(entry.schoolId)
      if (owner !== undefined) {
        throw new RegistryError(
          `registry gives the schoolId ${entry.schoolId} to both ${owner} and ${entry.slug}`,
        )
      }
      seenIds.set(entry.schoolId, entry.slug)
    }
  }
  return entries
}

/**
 * Strips a UTF-8 byte order mark.
 *
 * This job is operated from a Windows machine, where saving a file from Notepad or PowerShell
 * writes one by default -- and `JSON.parse` then fails with "Unexpected token", which reads like
 * the operator typed something wrong rather than like their editor added an invisible byte.
 */
const withoutByteOrderMark = (contents: string): string =>
  contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents

const readRegistryDocument = async (path: string): Promise<Record<string, unknown>> => {
  const contents = await readFile(path, 'utf8')
  const raw = JSON.parse(withoutByteOrderMark(contents)) as unknown
  if (!isRecord(raw) || !Array.isArray(raw['schools'])) {
    throw new RegistryError('registry must be a JSON object with a schools array')
  }
  return raw
}

export const loadRegistry = async (path: string): Promise<SchoolEntry[]> => {
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch (error) {
    throw new RegistryError(`Could not read the registry at ${path}: ${String(error)}`)
  }
  try {
    return parseRegistry(JSON.parse(withoutByteOrderMark(contents)))
  } catch (error) {
    if (error instanceof RegistryError) throw error
    throw new RegistryError(`The registry at ${path} is not valid JSON: ${String(error)}`)
  }
}

/**
 * Atomically writes the operated registry after a verification state change.
 *
 * Verification is operational state, not a cache: losing a verifiedAt or a newly-issued token
 * means an operator has to repeat the ceremony, so unlike SchoolStore an unreadable registry is
 * never discarded or rebuilt. Writes go beside the target and rename over it, preserving the
 * previous complete file across a crash mid-write.
 */
export const saveRegistry = async (path: string, entries: SchoolEntry[]): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${Date.now()}-${process.pid}.registry.tmp`)
  try {
    // Preserve operator annotations and fields from a newer version of this tool. Verification
    // owns only the parsed fields it changes; serializing the model alone would erase the
    // `_comment` block the example file itself ships, plus any contact notes an operator added.
    const original = await readRegistryDocument(path)
    const originalSchools = original['schools'] as unknown[]
    const stored = originalSchools.filter(isRecord)
    const bySlug = new Map(
      stored
        .filter((school) => typeof school['slug'] === 'string')
        .map((school) => [school['slug'] as string, school]),
    )
    // Identity first, slug second: a rename changes the slug, and matching on it alone would
    // treat the renamed school as a new one -- losing its operator annotations and, worse,
    // losing the check below that its identity did not change with its name.
    const byId = new Map(
      stored
        .filter((school) => typeof school['schoolId'] === 'string')
        .map((school) => [school['schoolId'] as string, school]),
    )
    const schools = entries.map((entry) => {
      const before =
        (entry.schoolId !== undefined ? byId.get(entry.schoolId) : undefined) ??
        bySlug.get(entry.slug) ??
        {}
      const beforeVerification = isRecord(before['verification']) ? before['verification'] : {}
      const issued = before['schoolId']
      // Identity is write-once. Everything else in an entry is operator state that may be
      // corrected in place; rewriting an id would silently orphan every cache, stored selection
      // and session that already refers to it, and nothing downstream could tell it happened.
      if (typeof issued === 'string' && entry.schoolId !== undefined && entry.schoolId !== issued) {
        throw new RegistryError(
          `refusing to change the schoolId of ${entry.slug} from ${issued} to ${entry.schoolId}`,
        )
      }
      return {
        ...before,
        ...entry,
        verification: { ...beforeVerification, ...entry.verification },
      }
    })
    await writeFile(
      temporary,
      `${JSON.stringify({ ...original, schools }, null, 2)}\n`,
      'utf8',
    )
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

/**
 * Serializes registry read-modify-write operations across CLI processes.
 *
 * `verify:all` spends seconds on network I/O after reading the file. Without a lock, issuing a
 * new token or toggling `listed` during that pass is silently overwritten by the old snapshot
 * when the pass saves. A directory creation is atomic on Windows and POSIX; failing fast is
 * safer than waiting behind an operator command whose duration is unknown.
 */
export const withRegistryLock = async <T>(path: string, operation: () => Promise<T>): Promise<T> => {
  const lock = `${path}.lock`
  await mkdir(dirname(path), { recursive: true })
  try {
    await mkdir(lock)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      throw new RegistryError(
        `The registry is busy (${lock} exists). If no verify command is running, remove that stale lock directory.`,
      )
    }
    throw error
  }

  try {
    await writeFile(
      join(lock, 'owner.json'),
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
      'utf8',
    )
    return await operation()
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

/** Schools this page may poll and show: verified, and not switched off by the operator. */
export const pollableSchools = (entries: SchoolEntry[]): SchoolEntry[] =>
  entries.filter((entry) => entry.listed && entry.verification.state === 'verified')
