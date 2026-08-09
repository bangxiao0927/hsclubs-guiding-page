import { randomBytes, timingSafeEqual } from 'node:crypto'

import { fetchSummary, type FetchOptions } from './fetchSummary.js'
import type { SchoolEntry } from './registry.js'

const CHALLENGE_PATH = '/.well-known/hsclubs-site.txt'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 4 * 1024

export interface VerificationOptions {
  now?: () => Date
  timeoutMs?: number
  maxBytes?: number
  fetchImpl?: typeof fetch
}

export interface VerificationResult {
  entry: SchoolEntry
  verified: boolean
}

/** 256 bits, encoded for copy/paste into a plain text file. */
export const issueVerificationToken = (): string => randomBytes(32).toString('base64url')

export const challengeUrlFor = (summaryUrl: string): URL => {
  const summary = new URL(summaryUrl)
  return new URL(CHALLENGE_PATH, summary.origin)
}

const discard = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined)
}

const readBoundedText = async (response: Response, maxBytes: number): Promise<string> => {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discard(response)
    throw new Error(`challenge declares ${declared} bytes, over the ${maxBytes} cap`)
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
      if (total > maxBytes) throw new Error(`challenge exceeded the ${maxBytes} byte cap`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Exact token comparison without data-dependent early return.
 *
 * The token is not a password to a write API -- there is no such API -- but it proves control of
 * the origin. Comparing it correctly costs essentially nothing and leaves no reason to revisit
 * this code if the verifier ever becomes internet-facing.
 */
const tokensMatch = (expected: string, actual: string): boolean => {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(actual, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

const failed = (entry: SchoolEntry, checkedAt: string, error: unknown): VerificationResult => ({
  verified: false,
  entry: {
    ...entry,
    verification: {
      ...entry.verification,
      state: 'failing',
      lastCheckedAt: checkedAt,
      lastError: error instanceof Error ? error.message : String(error),
    },
  },
})

/**
 * Proves that this summary URL belongs to the school the registry says it does:
 *
 * 1. Fetch the one-time token from the same origin, over HTTPS, following no redirect.
 * 2. Fetch `/api/summary` through the same bounded fetcher used by the poller and require the
 *    site's slug to agree with the registry.
 *
 * Both checks run on every re-verification. A school leaves by removing the challenge file; the
 * next pass moves it to failing and the poller stops listing it.
 */
export const verifySchool = async (
  entry: SchoolEntry,
  options: VerificationOptions = {},
): Promise<VerificationResult> => {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString()
  const token = entry.verification.token
  if (!token) return failed(entry, checkedAt, 'No verification token has been issued')

  const url = challengeUrlFor(entry.summaryUrl)
  if (url.protocol !== 'https:') return failed(entry, checkedAt, 'Challenge URL must be https')

  try {
    const doFetch = options.fetchImpl ?? fetch
    const response = await doFetch(url, {
      method: 'GET',
      headers: { accept: 'text/plain' },
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (response.status >= 300 && response.status < 400) {
      await discard(response)
      throw new Error(`Challenge redirected (status ${response.status}); redirects are not trusted`)
    }
    if (!response.ok) {
      await discard(response)
      throw new Error(`Challenge answered ${response.status}`)
    }

    // A trailing newline is what a text file normally has; no other normalization, because a
    // token embedded in a page or surrounded by other text is not the challenge file requested.
    const actual = (await readBoundedText(response, options.maxBytes ?? DEFAULT_MAX_BYTES))
      .replace(/\r?\n$/, '')
    if (!tokensMatch(token, actual)) throw new Error('Challenge token did not match')

    // Reuse the producer contract and all of its bounds (HTTPS, no redirect, size cap, JSON
    // shape, slug agreement). A challenge alone proves control of a host; the summary check
    // proves that the data on that host claims the same school identity as the registry.
    const summaryOptions: FetchOptions = {}
    if (options.fetchImpl) summaryOptions.fetchImpl = options.fetchImpl
    if (options.timeoutMs !== undefined) summaryOptions.timeoutMs = options.timeoutMs
    await fetchSummary(entry.summaryUrl, entry.slug, summaryOptions)

    return {
      verified: true,
      entry: {
        ...entry,
        verification: {
          ...entry.verification,
          state: 'verified',
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt,
          lastError: null,
        },
      },
    }
  } catch (error) {
    return failed(entry, checkedAt, error)
  }
}
