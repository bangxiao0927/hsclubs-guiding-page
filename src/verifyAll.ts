import type { SchoolEntry } from './registry.js'
import { verifySchool, type VerificationOptions } from './verifySchool.js'

export interface VerificationReport {
  checked: number
  verified: number
  failing: number
  entries: SchoolEntry[]
}

/**
 * Re-verifies every listed school, one at a time, preserving registry order.
 *
 * Unlisted entries are left exactly as they are: the operator's switch means "do not guide this
 * school", not "keep making network calls to it". A failure is a per-school state transition,
 * not an exception that ends the pass.
 */
export const verifyAllSchools = async (
  entries: SchoolEntry[],
  options: VerificationOptions & { onSchool?: (entry: SchoolEntry) => void } = {},
): Promise<VerificationReport> => {
  let checked = 0
  let verified = 0
  let failing = 0

  const updated: SchoolEntry[] = []
  for (const entry of entries) {
    if (!entry.listed) {
      updated.push(entry)
      continue
    }

    checked += 1
    const result = await verifySchool(entry, options)
    updated.push(result.entry)
    if (result.verified) verified += 1
    else failing += 1
    options.onSchool?.(result.entry)
  }

  return { checked, verified, failing, entries: updated }
}
