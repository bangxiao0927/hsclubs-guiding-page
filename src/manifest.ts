import { discardResponse, readBoundedText } from './boundedResponse.js'
import { validateContract } from './contracts.js'
import type { SchoolEntry } from './registry.js'

/**
 * A school's own statement of what it is and what it implements, and the checks that decide
 * whether to believe it.
 *
 * `GET /.well-known/hsclubs-app.json` is a claim, not proof. Control of the origin is proved
 * separately by the challenge file (verifySchool.ts); this document only says which identity that
 * origin believes it has and which v1 contracts it speaks. Every field is therefore compared
 * against what the registry already knows, and a disagreement is reported per school rather than
 * thrown at the pass that is reading every school.
 *
 * Schema and rules: contracts/v1/schemas/school-manifest.schema.json.
 */
export const MANIFEST_PATH = '/.well-known/hsclubs-app.json'

const DEFAULT_TIMEOUT_MS = 10_000
/** A manifest is a few hundred bytes; anything near this is a wrong endpoint. */
const DEFAULT_MAX_BYTES = 32 * 1024

export interface SchoolManifest {
  schoolId: string
  slug: string
  siteOrigin: string
  summaryUrl: string
  capabilities: string[]
  mobileAuth: { supported: boolean; startUrl: string | null; completeUrl: string | null }
}

/**
 * Why a manifest could not be used, in the vocabulary an operator has to act on.
 *
 * `absent` is not a failure: a school that has not deployed the v1 template yet answers 404, and
 * that school keeps being polled and listed exactly as before. The mismatches are failures, and
 * they are the ones worth naming separately -- "this origin claims another school's identity"
 * and "this school moved" need different answers from a human.
 */
export type ManifestProblem =
  | 'absent'
  | 'unreachable'
  | 'invalid'
  | 'id-missing'
  | 'id-mismatch'
  | 'slug-mismatch'
  | 'origin-mismatch'

export type ManifestResult =
  | { outcome: 'ok'; manifest: SchoolManifest }
  | { outcome: 'problem'; problem: ManifestProblem; detail: string }

export interface ManifestOptions {
  timeoutMs?: number
  maxBytes?: number
  fetchImpl?: typeof fetch
}

export const manifestUrlFor = (summaryUrl: string): URL =>
  new URL(MANIFEST_PATH, new URL(summaryUrl).origin)

const problem = (problem: ManifestProblem, detail: string): ManifestResult => ({
  outcome: 'problem',
  problem,
  detail,
})

const toManifest = (body: Record<string, unknown>): SchoolManifest => {
  const auth = (body['auth'] ?? {}) as Record<string, unknown>
  const mobile = (auth['mobile'] ?? {}) as Record<string, unknown>
  return {
    schoolId: body['schoolId'] as string,
    slug: body['slug'] as string,
    siteOrigin: body['siteOrigin'] as string,
    summaryUrl: body['summaryUrl'] as string,
    capabilities: (body['capabilities'] as string[]) ?? [],
    mobileAuth: {
      supported: mobile['supported'] === true,
      startUrl: typeof mobile['startUrl'] === 'string' ? mobile['startUrl'] : null,
      completeUrl: typeof mobile['completeUrl'] === 'string' ? mobile['completeUrl'] : null,
    },
  }
}

/**
 * Reads and checks one school's manifest.
 *
 * Bounded exactly like the summary fetch, for the same reason: the URL comes from the registry,
 * so this is a server-side request to an address chosen by configuration. HTTPS only, no
 * redirects followed, short timeout, size cap.
 */
export const fetchManifest = async (
  entry: SchoolEntry,
  options: ManifestOptions = {},
): Promise<ManifestResult> => {
  const url = manifestUrlFor(entry.summaryUrl)
  if (url.protocol !== 'https:') {
    return problem('unreachable', `manifest URL must be https, got ${url.protocol}`)
  }

  let response: Response
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (error) {
    return problem('unreachable', error instanceof Error ? error.message : String(error))
  }

  if (response.status === 404 || response.status === 410) {
    await discardResponse(response)
    return problem('absent', `${url.host} does not publish ${MANIFEST_PATH} yet`)
  }
  if (response.status >= 300 && response.status < 400) {
    await discardResponse(response)
    return problem('invalid', `${url.host} redirected the manifest (status ${response.status})`)
  }
  if (!response.ok) {
    await discardResponse(response)
    return problem('unreachable', `${url.host} answered ${response.status}`)
  }

  let body: unknown
  try {
    const text = await readBoundedText(response, options.maxBytes ?? DEFAULT_MAX_BYTES, {
      label: 'manifest',
      error: (message) => new Error(message),
    })
    body = JSON.parse(text)
  } catch (error) {
    return problem('invalid', error instanceof Error ? error.message : String(error))
  }

  const violations = validateContract('school-manifest', body)
  if (violations.length > 0) {
    return problem(
      'invalid',
      violations
        .slice(0, 3)
        .map((violation) => `${violation.path || '/'} ${violation.message}`)
        .join('; '),
    )
  }

  const manifest = toManifest(body as Record<string, unknown>)
  return checkIdentity(entry, manifest)
}

/**
 * Does this manifest describe the school the registry thinks it does?
 *
 * Three separate questions, answered separately because the answers mean different things: an id
 * that disagrees is one school claiming another's identity, a slug that disagrees is a rename
 * that has not reached the registry, and an origin that disagrees means the document was copied
 * from somewhere else.
 */
export const checkIdentity = (entry: SchoolEntry, manifest: SchoolManifest): ManifestResult => {
  if (entry.schoolId === undefined) {
    return problem(
      'id-missing',
      `${manifest.schoolId} is published by ${manifest.siteOrigin}, but the registry has issued no id for ${entry.slug}`,
    )
  }
  if (manifest.schoolId !== entry.schoolId) {
    return problem(
      'id-mismatch',
      `${entry.slug} publishes schoolId ${manifest.schoolId}, but the registry issued ${entry.schoolId}`,
    )
  }

  const registeredOrigin = new URL(entry.summaryUrl).origin
  if (manifest.siteOrigin !== registeredOrigin) {
    return problem(
      'origin-mismatch',
      `${entry.slug} publishes siteOrigin ${manifest.siteOrigin}, but the registry verified ${registeredOrigin}`,
    )
  }
  if (new URL(manifest.summaryUrl).origin !== registeredOrigin) {
    return problem(
      'origin-mismatch',
      `${entry.slug} points its summaryUrl at ${new URL(manifest.summaryUrl).origin}, off its own verified origin`,
    )
  }
  if (manifest.slug !== entry.slug) {
    return problem(
      'slug-mismatch',
      `${entry.slug} publishes slug ${manifest.slug}; the identity is unchanged, but the registry's handle is stale`,
    )
  }

  return { outcome: 'ok', manifest }
}
