import { discardResponse, readBoundedText } from './boundedResponse.js'
import { parseSummary, type SchoolSummary } from './summary.js'

/**
 * The one network call this repo makes: a bounded, conditional GET of a school's summary.
 *
 * The URL comes from the registry, so this is a server-side request to an address chosen by
 * configuration rather than by code. Every bound here exists for that reason -- see
 * docs/BRIDGE_CONTRACT.md.
 */
export interface FetchOptions {
  /** Sent as If-None-Match, so an unchanged school costs one 304 and no body. */
  etag?: string | null
  timeoutMs?: number
  maxBytes?: number
  fetchImpl?: typeof fetch
  /**
   * The identity the registry issued to this school, when it has one.
   *
   * A summary that stamps a different id is refused rather than stored: identity drift is how a
   * school's readers -- caches, stored selections, sessions -- would silently follow a different
   * school. A summary with no id at all is the unversioned endpoint and stays acceptable.
   */
  expectedSchoolId?: string | null
}

export type FetchResult =
  | { outcome: 'updated'; summary: SchoolSummary; etag: string | null }
  | { outcome: 'not-modified' }

export class SummaryFetchError extends Error {
  constructor(
    message: string,
    /** True when retrying later can reasonably succeed without an operator changing anything. */
    readonly transient = false,
  ) {
    super(message)
  }
}

const DEFAULT_TIMEOUT_MS = 10_000
/** A summary is a few kilobytes; anything near this is a wrong endpoint, not a big school. */
const DEFAULT_MAX_BYTES = 256 * 1024

export const fetchSummary = async (
  summaryUrl: string,
  expectedSlug: string,
  options: FetchOptions = {},
): Promise<FetchResult> => {
  const url = new URL(summaryUrl)
  if (url.protocol !== 'https:') {
    throw new SummaryFetchError(`Refusing to fetch a non-https summary URL: ${summaryUrl}`)
  }

  const doFetch = options.fetchImpl ?? fetch
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.etag) headers['if-none-match'] = options.etag

  const response = await doFetch(url, {
    method: 'GET',
    headers,
    // Manual, so a registered site cannot redirect this server-side fetch somewhere else --
    // including to an address inside this machine's own network.
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  })

  if (response.status === 304) {
    if (!options.etag) {
      await discardResponse(response)
      // There is no stored representation for "not modified" to refer to. In verification this
      // would otherwise bypass the summary body and therefore the slug-agreement check entirely.
      throw new SummaryFetchError(`${url.host} answered 304 although no ETag was sent`)
    }
    return { outcome: 'not-modified' }
  }

  if (response.status >= 300 && response.status < 400) {
    await discardResponse(response)
    throw new SummaryFetchError(
      `Refusing to follow a redirect from ${url.host} (status ${response.status})`,
    )
  }
  if (!response.ok) {
    await discardResponse(response)
    throw new SummaryFetchError(
      `${url.host} answered ${response.status}`,
      response.status >= 500 || response.status === 408 || response.status === 429,
    )
  }

  const body = await readBoundedText(response, maxBytes, {
    label: 'Response',
    error: (message) => new SummaryFetchError(message),
  })
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new SummaryFetchError(`${url.host} did not answer with JSON`)
  }

  const summary = parseSummary(parsed)
  // The registry says which school this URL is; the site says which school it is. They have to
  // agree, or one verified school could be serving another's identity.
  if (summary.slug !== expectedSlug) {
    throw new SummaryFetchError(
      `${url.host} claims slug "${summary.slug}", but the registry has "${expectedSlug}"`,
    )
  }
  const expectedSchoolId = options.expectedSchoolId ?? null
  if (summary.schoolId !== null && expectedSchoolId !== null && summary.schoolId !== expectedSchoolId) {
    throw new SummaryFetchError(
      `${url.host} claims schoolId "${summary.schoolId}", but the registry issued "${expectedSchoolId}"`,
    )
  }

  return { outcome: 'updated', summary, etag: response.headers.get('etag') }
}
