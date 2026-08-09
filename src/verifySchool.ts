import { randomBytes, timingSafeEqual } from 'node:crypto'

import { discardResponse, readBoundedText } from './boundedResponse.js'
import { fetchSummary, SummaryFetchError, type FetchOptions } from './fetchSummary.js'
import type { SchoolEntry } from './registry.js'
import { SummaryFormatError } from './summary.js'

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
  /** True only when both checks succeeded in this attempt. */
  verified: boolean
  /** The check could not finish, but did not disprove a previous verification. */
  transientFailure: boolean
}

class DefinitiveVerificationError extends Error {}

/** 256 bits, encoded for copy/paste into a plain text file. */
export const issueVerificationToken = (): string => randomBytes(32).toString('base64url')

export const challengeUrlFor = (summaryUrl: string): URL => {
  const summary = new URL(summaryUrl)
  return new URL(CHALLENGE_PATH, summary.origin)
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

const failed = (entry: SchoolEntry, checkedAt: string, error: unknown): VerificationResult => {
  const definitive =
    error instanceof DefinitiveVerificationError ||
    error instanceof SummaryFormatError ||
    (error instanceof SummaryFetchError && !error.transient)

  return {
    verified: false,
    transientFailure: !definitive,
    entry: {
      ...entry,
      verification: {
        ...entry.verification,
        // A DNS outage, timeout or 5xx proves nothing about ownership. Keep a previously
        // verified school visible and try again later; only a missing/wrong challenge, bad
        // summary contract, or identity mismatch revokes the proof immediately.
        state: definitive ? 'failing' : entry.verification.state,
        lastCheckedAt: checkedAt,
        lastError: error instanceof Error ? error.message : String(error),
      },
    },
  }
}

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
  if (!token) {
    return failed(
      entry,
      checkedAt,
      new DefinitiveVerificationError('No verification token has been issued'),
    )
  }

  const url = challengeUrlFor(entry.summaryUrl)
  if (url.protocol !== 'https:') {
    return failed(entry, checkedAt, new DefinitiveVerificationError('Challenge URL must be https'))
  }

  try {
    const doFetch = options.fetchImpl ?? fetch
    const response = await doFetch(url, {
      method: 'GET',
      headers: { accept: 'text/plain' },
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (response.status >= 300 && response.status < 400) {
      await discardResponse(response)
      throw new DefinitiveVerificationError(
        `Challenge redirected (status ${response.status}); redirects are not trusted`,
      )
    }
    if (!response.ok) {
      await discardResponse(response)
      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        throw new Error(`Challenge answered ${response.status}`)
      }
      throw new DefinitiveVerificationError(`Challenge answered ${response.status}`)
    }

    // A trailing newline is what a text file normally has; no other normalization, because a
    // token embedded in a page or surrounded by other text is not the challenge file requested.
    const actual = (await readBoundedText(response, options.maxBytes ?? DEFAULT_MAX_BYTES, {
      label: 'challenge',
      error: (message) => new DefinitiveVerificationError(message),
    }))
      .replace(/\r?\n$/, '')
    if (!tokensMatch(token, actual)) {
      throw new DefinitiveVerificationError('Challenge token did not match')
    }

    // Reuse the producer contract and all of its bounds (HTTPS, no redirect, size cap, JSON
    // shape, slug agreement). A challenge alone proves control of a host; the summary check
    // proves that the data on that host claims the same school identity as the registry.
    const summaryOptions: FetchOptions = {}
    if (options.fetchImpl) summaryOptions.fetchImpl = options.fetchImpl
    if (options.timeoutMs !== undefined) summaryOptions.timeoutMs = options.timeoutMs
    await fetchSummary(entry.summaryUrl, entry.slug, summaryOptions)

    return {
      verified: true,
      transientFailure: false,
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
