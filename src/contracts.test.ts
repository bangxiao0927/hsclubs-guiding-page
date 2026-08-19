import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  CONTRACT_NAMES,
  computeManifest,
  contractsDir,
  honoursContract,
  loadFixtures,
  manifestDrift,
  readManifest,
  validateContract,
  type ContractName,
} from './contracts.js'
import { parseSummary } from './summary.js'

const vectors = JSON.parse(
  readFileSync(join(contractsDir, 'vectors', 'mobile-auth.json'), 'utf8'),
) as {
  pkce: { codeVerifier: string; codeChallenge: string }
  oneTimeCode: { code: string; storedDigestHex: string; lifetimeSeconds: { min: number; max: number } }
  startUrl: { example: string }
  callbackUrl: { success: string; cancelled: string }
}

const fixture = (contract: ContractName, file: string): unknown => {
  const found = loadFixtures(contract).find((entry) => entry.file === file)
  if (!found) throw new Error(`no fixture ${contract}/${file}`)
  return found.body
}

describe('shared v1 fixtures', () => {
  const fixtures = loadFixtures()

  it('covers every contract from both sides', () => {
    for (const contract of CONTRACT_NAMES) {
      const mine = fixtures.filter((entry) => entry.contract === contract)
      expect(mine.some((entry) => entry.expectValid), `${contract} has no valid fixture`).toBe(true)
      expect(mine.some((entry) => !entry.expectValid), `${contract} has no invalid fixture`).toBe(true)
    }
  })

  it.each(fixtures.map((entry) => [`${entry.contract}/${entry.file}`, entry] as const))(
    '%s validates as its name promises',
    (_name, entry) => {
      const violations = validateContract(entry.contract, entry.body)
      expect(violations.length === 0, JSON.stringify(violations)).toBe(entry.expectValid)
    },
  )
})

describe('forward compatibility', () => {
  it('accepts members a newer producer added', () => {
    expect(honoursContract('summary', fixture('summary', 'valid-unknown-field.json'))).toBe(true)
    expect(honoursContract('app-directory', fixture('app-directory', 'valid-unknown-field.json'))).toBe(
      true,
    )
    expect(
      honoursContract('school-manifest', fixture('school-manifest', 'valid-unknown-capability.json')),
    ).toBe(true)
  })

  it('refuses a parameter the school would have to act on but does not know', () => {
    expect(honoursContract('mobile-auth-start', fixture('mobile-auth-start', 'invalid-unknown-parameter.json'))).toBe(
      false,
    )
    expect(
      honoursContract('mobile-auth-callback', fixture('mobile-auth-callback', 'invalid-token-passthrough.json')),
    ).toBe(false)
  })

  it('keeps the legacy unversioned summary readable while refusing it as v1', () => {
    const legacy = fixture('summary', 'invalid-legacy-unversioned.json')
    expect(honoursContract('summary', legacy)).toBe(false)
    // The existing /api/summary reader is untouched by v1, which is what lets the two run side
    // by side through the migration.
    expect(parseSummary(legacy).slug).toBe('mvhs')
  })

  it('reads a v1 summary through the legacy parser too, so a school may serve one body', () => {
    expect(parseSummary(fixture('summary', 'valid.json')).clubCount).toBe(106)
  })
})

describe('error isolation', () => {
  it('keeps a directory valid when one school is incompatible', () => {
    const mixed = fixture('app-directory', 'valid-mixed.json') as {
      schools: { integrationStatus: string; unavailableReason: string | null }[]
    }
    expect(honoursContract('app-directory', mixed)).toBe(true)
    expect(mixed.schools.map((school) => school.integrationStatus)).toEqual([
      'compatible',
      'degraded',
      'incompatible',
    ])
  })

  it('still validates when every school failed, and when there are none', () => {
    const mixed = fixture('app-directory', 'valid-mixed.json') as {
      schools: { integrationStatus: string; unavailableReason: string | null }[]
    }
    const allBroken = {
      ...(mixed as object),
      schools: mixed.schools.map((school) => ({
        ...school,
        integrationStatus: 'incompatible',
        unavailableReason: 'summary did not match contract hsclubs.summary v1',
      })),
    }
    expect(honoursContract('app-directory', allBroken)).toBe(true)
    expect(honoursContract('app-directory', fixture('app-directory', 'valid-empty.json'))).toBe(true)
  })

  it('will not let a school be marked unavailable without saying why', () => {
    expect(
      honoursContract(
        'app-directory',
        fixture('app-directory', 'invalid-incompatible-without-reason.json'),
      ),
    ).toBe(false)
  })
})

describe('identity', () => {
  it('rejects a slug used where a schoolId belongs', () => {
    expect(honoursContract('school-manifest', fixture('school-manifest', 'invalid-school-id-shape.json'))).toBe(
      false,
    )
  })

  it('reports the member at fault rather than only that the document is wrong', () => {
    const violations = validateContract('summary', fixture('summary', 'invalid-club-count-type.json'))
    expect(violations.map((violation) => violation.path)).toContain('/clubCount')
  })
})

describe('mobile auth vectors', () => {
  it('derives the pinned S256 challenge from the pinned verifier', () => {
    const challenge = createHash('sha256').update(vectors.pkce.codeVerifier, 'ascii').digest('base64url')
    expect(challenge).toBe(vectors.pkce.codeChallenge)
  })

  it('stores only the digest of the one-time code', () => {
    const digest = createHash('sha256').update(vectors.oneTimeCode.code, 'utf8').digest('hex')
    expect(digest).toBe(vectors.oneTimeCode.storedDigestHex)
    expect(vectors.oneTimeCode.lifetimeSeconds.min).toBeGreaterThanOrEqual(60)
    expect(vectors.oneTimeCode.lifetimeSeconds.max).toBeLessThanOrEqual(120)
  })

  const paramsOf = (url: string): Record<string, string> =>
    Object.fromEntries(new URL(url).searchParams.entries())

  it('pins start and callback URLs that honour their own schemas', () => {
    expect(validateContract('mobile-auth-start', paramsOf(vectors.startUrl.example))).toEqual([])
    expect(validateContract('mobile-auth-callback', paramsOf(vectors.callbackUrl.success))).toEqual([])
    expect(validateContract('mobile-auth-callback', paramsOf(vectors.callbackUrl.cancelled))).toEqual([])
  })

  it('never carries a credential back on the callback link', () => {
    for (const key of Object.keys(paramsOf(vectors.callbackUrl.success))) {
      expect(['schoolId', 'state', 'code']).toContain(key)
    }
  })

  it('completes only with the verifier that produced the challenge', () => {
    const complete = fixture('mobile-auth-complete-request', 'valid.json') as { code_verifier: string }
    expect(complete.code_verifier).toBe(vectors.pkce.codeVerifier)
  })
})

describe('shared artifact checksums', () => {
  it('matches the recorded manifest, so a vendored copy can prove it is this copy', () => {
    expect(manifestDrift(readManifest(), computeManifest())).toEqual({
      added: [],
      removed: [],
      changed: [],
    })
  })

  it('records every schema and fixture with a posix path', () => {
    const files = Object.keys(readManifest().files)
    expect(files.every((file) => !file.includes('\\'))).toBe(true)
    for (const contract of CONTRACT_NAMES) {
      expect(files).toContain(`schemas/${contract}.schema.json`)
    }
  })
})
