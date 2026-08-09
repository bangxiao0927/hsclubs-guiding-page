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
}

export type FetchResult =
  | { outcome: 'updated'; summary: SchoolSummary; etag: string | null }
  | { outcome: 'not-modified' }

export class SummaryFetchError extends Error {}

const DEFAULT_TIMEOUT_MS = 10_000
/** A summary is a few kilobytes; anything near this is a wrong endpoint, not a big school. */
const DEFAULT_MAX_BYTES = 256 * 1024

const readBounded = async (response: Response, maxBytes: number): Promise<string> => {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SummaryFetchError(`Response declares ${declared} bytes, over the ${maxBytes} cap`)
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      // Checked while reading, not after: a Content-Length can lie, or be absent entirely on a
      // chunked response, and the point of the cap is to stop reading rather than to complain
      // once the memory is already gone.
      if (total > maxBytes) {
        throw new SummaryFetchError(`Response exceeded the ${maxBytes} byte cap`)
      }
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}

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

  if (response.status === 304) return { outcome: 'not-modified' }

  if (response.status >= 300 && response.status < 400) {
    throw new SummaryFetchError(
      `Refusing to follow a redirect from ${url.host} (status ${response.status})`,
    )
  }
  if (!response.ok) {
    throw new SummaryFetchError(`${url.host} answered ${response.status}`)
  }

  const body = await readBounded(response, maxBytes)
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

  return { outcome: 'updated', summary, etag: response.headers.get('etag') }
}
