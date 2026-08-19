import { describe, expect, it } from 'vitest'

import {
  AASA_PATH,
  MOBILE_AUTH_CALLBACK_PATH,
  buildAppleAppSiteAssociation,
  renderMobileAuthFallback,
} from './mobileAuthCallback.js'

describe('buildAppleAppSiteAssociation', () => {
  it('associates the configured app id with only the callback path', () => {
    const aasa = buildAppleAppSiteAssociation('ABCDE12345.net.hsclubs.app') as {
      applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] }
    }
    const detail = aasa.applinks.details[0]!
    expect(detail.appIDs).toEqual(['ABCDE12345.net.hsclubs.app'])
    expect(detail.components.map((component) => component['/'])).toEqual([MOBILE_AUTH_CALLBACK_PATH])
  })

  it('publishes nothing rather than a placeholder when no app id is configured', () => {
    expect(buildAppleAppSiteAssociation(null)).toBeNull()
    expect(buildAppleAppSiteAssociation('')).toBeNull()
  })

  it('refuses an app id that is not a TeamID.bundleId pair', () => {
    expect(buildAppleAppSiteAssociation('net.hsclubs.app')).toBeNull()
    expect(buildAppleAppSiteAssociation('shortid.net.hsclubs.app')).toBeNull()
  })

  it('exposes the canonical callback path issue #2 pins', () => {
    expect(MOBILE_AUTH_CALLBACK_PATH).toBe('/mobile-auth/callback')
    expect(AASA_PATH).toBe('/.well-known/apple-app-site-association')
  })
})

describe('renderMobileAuthFallback', () => {
  const page = renderMobileAuthFallback()

  it('is static: it carries nothing that could reflect a query parameter', () => {
    // The page is a constant, so the strongest guarantee is that the known-sensitive parameter
    // names never appear in it at all.
    for (const token of ['code', 'state', 'code_verifier', 'schoolId', 'id_token', 'access_token']) {
      expect(page.includes(`${token}=`)).toBe(false)
    }
    expect(page).not.toContain('location.search')
    expect(page).not.toContain('URLSearchParams')
  })

  it('tells a stranded user how to return safely', () => {
    expect(page).toContain('HS Clubs app')
    expect(page).toContain('safe to close')
  })
})
