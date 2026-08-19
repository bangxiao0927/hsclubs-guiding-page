import { randomBytes } from 'node:crypto'

/**
 * The permanent identity of a school, issued here and used by every repository.
 *
 * A slug is a handle: it appears in URLs, it is chosen by a person, and a school that renames
 * itself expects it to change. Identity cannot work that way -- the app remembers which school
 * somebody picked, the template stamps its own summary, and a rename must not turn those into a
 * different school. So the registry issues one opaque value per school, once, and nothing is
 * derived from its bytes: not the name, not the host, not the year it joined.
 *
 * Format and rules: contracts/v1/README.md.
 */
export const SCHOOL_ID_PATTERN = /^sch_[A-Za-z0-9]{16,48}$/

/** A demo entry's identity says so in the value itself. */
export const DEMO_SCHOOL_ID_PREFIX = 'sch_demo'

export const isSchoolId = (value: unknown): value is string =>
  typeof value === 'string' && SCHOOL_ID_PATTERN.test(value)

export const isDemoSchoolId = (value: string): boolean => value.startsWith(DEMO_SCHOOL_ID_PREFIX)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A new identity, 20 random alphanumerics after the prefix -- about 119 bits.
 *
 * Random rather than sequential: an identifier that is public in an app's cache and in three
 * repositories' fixtures should not also disclose how many schools joined before this one.
 *
 * A demo school's identity carries `demo` in the prefix. Verification proves control of an
 * origin, never that a fixture is an institution, and an operator reading a log or an app
 * developer reading a cache should not have to consult the registry to tell the two apart.
 */
export const issueSchoolId = ({ demo = false }: { demo?: boolean } = {}): string => {
  const bytes = randomBytes(20)
  let random = ''
  for (const byte of bytes) {
    // Rejection-free and unbiased enough for an opaque label: the alphabet has 62 entries and a
    // byte has 256 values, so the first two entries are ~1.6% likelier than the rest.
    random += ALPHABET[byte % ALPHABET.length]
  }
  // No separator before the random part: the contract's identifiers are `sch_` followed by
  // alphanumerics only, so `demo` reads as the first four characters of an opaque value.
  return demo ? `${DEMO_SCHOOL_ID_PREFIX}${random}` : `sch_${random}`
}
