/**
 * The shape a school site publishes at `GET /api/summary`, and the checks that decide whether a
 * response can be trusted enough to store.
 *
 * See docs/BRIDGE_CONTRACT.md. Everything here arrives from someone else's server, so the
 * parsing is deliberately strict about the fields this page relies on and deliberately tolerant
 * about fields it does not know yet: a school running a newer version must not become
 * unreadable.
 */
export interface SchoolSummary {
  schoolName: string
  shortName: string | null
  slug: string
  /**
   * The permanent identity the school stamps on its own summary, or null on the unversioned
   * endpoint that predates it.
   *
   * Read but not required: `/api/summary` is still the production contract and carries no id.
   * When it is present it is checked against the registry, because a school claiming an identity
   * that is not its own is the one identity error that must never be stored.
   */
  schoolId: string | null
  address: string | null
  status: string | null
  clubCount: number
  categories: Record<string, number>
  memberCount: number
  /** ISO-8601 instant with an offset, or null for a directory that has never been updated. */
  lastUpdatedAt: string | null
  dataHash: string | null
}

export class SummaryFormatError extends Error {}

const SCHOOL_ID = /^sch_[A-Za-z0-9]{16,48}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const requireString = (source: Record<string, unknown>, field: string): string => {
  const value = source[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SummaryFormatError(`summary.${field} must be a non-empty string`)
  }
  return value
}

const optionalString = (source: Record<string, unknown>, field: string): string | null => {
  const value = source[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new SummaryFormatError(`summary.${field} must be a string or null`)
  }
  return value
}

const requireCount = (source: Record<string, unknown>, field: string): number => {
  const value = source[field]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SummaryFormatError(`summary.${field} must be a non-negative integer`)
  }
  return value
}

const requireCategories = (source: Record<string, unknown>): Record<string, number> => {
  const value = source['categories']
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) {
    throw new SummaryFormatError('summary.categories must be an object')
  }
  const categories: Record<string, number> = {}
  for (const [name, count] of Object.entries(value)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new SummaryFormatError(`summary.categories.${name} must be a non-negative integer`)
    }
    categories[name] = count
  }
  return categories
}

const optionalInstant = (source: Record<string, unknown>, field: string): string | null => {
  const value = optionalString(source, field)
  if (value === null) return null
  // An instant without an offset is ambiguous across schools in different zones, which is the
  // whole reason the producer publishes one; refuse to store a value we cannot compare.
  if (Number.isNaN(Date.parse(value)) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    throw new SummaryFormatError(`summary.${field} must be an ISO-8601 instant with an offset`)
  }
  return value
}

const optionalSchoolId = (source: Record<string, unknown>): string | null => {
  const value = source['schoolId']
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !SCHOOL_ID.test(value)) {
    throw new SummaryFormatError('summary.schoolId must be an opaque sch_ identifier')
  }
  return value
}

/** @throws SummaryFormatError if the body is not a summary this page can rely on */
export const parseSummary = (body: unknown): SchoolSummary => {
  if (!isRecord(body)) {
    throw new SummaryFormatError('summary must be a JSON object')
  }
  return {
    schoolName: requireString(body, 'schoolName'),
    shortName: optionalString(body, 'shortName'),
    slug: requireString(body, 'slug'),
    schoolId: optionalSchoolId(body),
    address: optionalString(body, 'address'),
    status: optionalString(body, 'status'),
    clubCount: requireCount(body, 'clubCount'),
    categories: requireCategories(body),
    memberCount: requireCount(body, 'memberCount'),
    lastUpdatedAt: optionalInstant(body, 'lastUpdatedAt'),
    dataHash: optionalString(body, 'dataHash'),
  }
}
