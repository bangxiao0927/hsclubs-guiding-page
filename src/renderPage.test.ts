import { describe, expect, it } from 'vitest'

import { describeAge, escapeHtml, renderPage } from './renderPage.js'
import { emptyRecord, type SchoolRecord } from './store.js'

const NOW = new Date('2026-08-09T12:00:00Z')

const record = (overrides: Partial<SchoolRecord> = {}): SchoolRecord => ({
  ...emptyRecord('mvhs'),
  summary: {
    schoolName: 'Mountain View High School',
    shortName: 'MVHS',
    slug: 'mvhs',
    address: '3535 Truman Ave, Mountain View, CA 94040',
    status: 'active',
    clubCount: 106,
    categories: { 'STEM & Innovation': 15, 'Service & Leadership': 60 },
    memberCount: 0,
    lastUpdatedAt: '2026-08-09T04:00:00-07:00',
    dataHash: 'hash',
  },
  etag: '"abc"',
  lastPolledAt: '2026-08-09T11:59:00Z',
  lastUpdatedAt: '2026-08-09T11:00:00Z',
  ...overrides,
})

describe('renderPage', () => {
  it('shows each school with its address, club count and categories', () => {
    const html = renderPage([record()], { now: NOW })

    expect(html).toContain('Mountain View High School')
    expect(html).toContain('3535 Truman Ave, Mountain View, CA 94040')
    expect(html).toContain('106')
    expect(html).toContain('Service &amp; Leadership')
    expect(html).toContain('Updated 1 hour ago')
  })

  // Every string on this page came from someone else's server. A school that renames itself to
  // a <script> tag must not get to run code in the operator's browser.
  it('escapes everything a school site supplied', () => {
    const hostile = record({
      summary: {
        ...record().summary!,
        schoolName: '<script>alert(1)</script>',
        address: '" onmouseover="alert(2)',
        categories: { '<img src=x onerror=alert(3)>': 1 },
      },
    })

    const html = renderPage([hostile], { now: NOW })

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('onmouseover="alert(2)')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('marks a school stale when the last poll failed, and says why', () => {
    const html = renderPage(
      [record({ lastUpdatedAt: '2026-08-01T12:00:00Z', lastError: 'mvhs.example.org answered 503' })],
      { now: NOW },
    )

    expect(html).toContain('class="school stale"')
    expect(html).toContain('8 days ago')
    expect(html).toContain('Last poll failed: mvhs.example.org answered 503')
  })

  it('marks a school stale when nothing has polled it for a while', () => {
    const html = renderPage([record({ lastPolledAt: '2026-08-05T12:00:00Z' })], { now: NOW })

    expect(html).toContain('class="school stale"')
  })

  // A directory that changes weekly is polled hourly and answers 304 almost every time. Judging
  // staleness by content age would brand every healthy school stale and make the signal useless.
  it('does not call a school stale just because its clubs have not changed', () => {
    const html = renderPage(
      [record({ lastUpdatedAt: '2026-07-01T12:00:00Z', lastPolledAt: '2026-08-09T11:59:00Z' })],
      { now: NOW },
    )

    expect(html).not.toContain('class="school stale"')
    expect(html).toContain('39 days ago')
  })

  // Listed but never read is exactly the case that would otherwise go unnoticed for months.
  it('still lists a school that has never been read successfully', () => {
    const html = renderPage([{ ...emptyRecord('newschool'), lastError: 'getaddrinfo ENOTFOUND' }], {
      now: NOW,
    })

    expect(html).toContain('newschool')
    expect(html).toContain('No data yet')
    expect(html).toContain('getaddrinfo ENOTFOUND')
  })

  it('sorts schools by name and survives having none', () => {
    const html = renderPage(
      [
        record({ summary: { ...record().summary!, schoolName: 'Zebra High' } }),
        record({ summary: { ...record().summary!, schoolName: 'Alpha High' } }),
      ],
      { now: NOW },
    )

    expect(html.indexOf('Alpha High')).toBeLessThan(html.indexOf('Zebra High'))
    expect(renderPage([], { now: NOW })).toContain('No schools yet')
  })
})

describe('describeAge', () => {
  it.each([
    ['2026-08-09T11:59:30Z', 'just now'],
    ['2026-08-09T11:20:00Z', '40 minutes ago'],
    ['2026-08-09T11:00:00Z', '1 hour ago'],
    ['2026-08-09T04:00:00Z', '8 hours ago'],
    ['2026-08-05T12:00:00Z', '4 days ago'],
  ])('describes %s as %s', (from, expected) => {
    expect(describeAge(from, NOW)).toBe(expected)
  })

  it('handles a school that has never been read, or a timestamp it cannot parse', () => {
    expect(describeAge(null, NOW)).toBe('never')
    expect(describeAge('not a date', NOW)).toBe('unknown')
  })
})

describe('escapeHtml', () => {
  it('escapes the characters that end an attribute or start a tag', () => {
    expect(escapeHtml(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#39;')
  })
})
