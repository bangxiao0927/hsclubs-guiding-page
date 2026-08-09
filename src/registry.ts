import { readFile } from 'node:fs/promises'

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
  summaryUrl: string
  verification: {
    token: string | null
    verifiedAt: string | null
    state: VerificationState
  }
  listed: boolean
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
  const listed = raw['listed']

  return {
    slug,
    summaryUrl,
    verification: {
      token: typeof token === 'string' ? token : null,
      verifiedAt: typeof verifiedAt === 'string' ? verifiedAt : null,
      state: state as VerificationState,
    },
    // Absent means listed: a school is added to be shown, and forgetting the flag should not
    // silently hide it.
    listed: listed === undefined ? true : listed === true,
  }
}

export const parseRegistry = (raw: unknown): SchoolEntry[] => {
  if (!isRecord(raw)) throw new RegistryError('registry must be a JSON object')
  const schools = raw['schools']
  if (!Array.isArray(schools)) throw new RegistryError('registry.schools must be an array')

  const entries = schools.map(parseEntry)
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.slug)) {
      throw new RegistryError(`registry has two schools with the slug ${entry.slug}`)
    }
    seen.add(entry.slug)
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

/** Schools this page may poll and show: verified, and not switched off by the operator. */
export const pollableSchools = (entries: SchoolEntry[]): SchoolEntry[] =>
  entries.filter((entry) => entry.listed && entry.verification.state === 'verified')
