import { describe, expect, it } from 'vitest'

import type { PageSchool } from './pageData.js'
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

const school = (
  overrides: Partial<SchoolRecord> = {},
  siteUrl = 'https://mvhs.example.org',
): PageSchool => ({ record: record(overrides), siteUrl })

describe('renderPage', () => {
  it('shows each school with its address, club count and categories', () => {
    const html = renderPage([school()], { now: NOW })

    expect(html).toContain('Mountain View High School')
    expect(html).toContain('3535 Truman Ave, Mountain View, CA 94040')
    expect(html).toContain('106')
    expect(html).toContain('Service &amp; Leadership')
    expect(html).toContain('Updated 1 hour ago')
  })

  // The page exists to hand a visitor over to the school that owns the data.
  it('makes the whole card one link to the school site', () => {
    const html = renderPage([school()], { now: NOW })

    expect(html).toContain('<a class="school" href="https://mvhs.example.org"')
    expect(html).toContain('mvhs.example.org')
    expect(html).toContain('Open site')
    expect(html).toContain('rel="noopener noreferrer"')
    // A link inside a link is invalid, and gives a keyboard user the same target twice.
    const start = html.indexOf('<a class="school')
    const card = html.slice(start, html.indexOf('</a>', start))
    expect(card.slice(2)).not.toContain('<a ')
  })

  // The proposition first, the list one scroll down -- with a way to skip the trip.
  it('puts the list below the first screen and links straight to it', () => {
    const html = renderPage([school()], { now: NOW })

    expect(html.indexOf('class="hero"')).toBeLessThan(html.indexOf('id="directories"'))
    expect(html).toContain('href="#directories"')
  })

  // Reveal-on-scroll that starts hidden would leave a scripting-off browser with an empty
  // page, which is far worse than an unanimated one.
  it('only hides revealed sections once its own script has run', () => {
    const html = renderPage([school()], { now: NOW })

    expect(html).toContain('.js [data-reveal] { opacity: 0')
    expect(html).not.toMatch(/\n\[data-reveal\] \{ opacity: 0/)
  })

  // An observer that never fires -- a background tab, a throttling browser, a layout that
  // never intersects -- must cost the animation, not the content.
  it('shows revealed sections on a timer even if the observer never fires', () => {
    expect(renderPage([school()], { now: NOW })).toContain("classList.add('in')})},1200)")
  })

  it('sums the directories it is showing', () => {
    const html = renderPage(
      [
        school(),
        { record: { ...record(), slug: 'other' }, siteUrl: 'https://other.example.org' },
      ],
      { now: NOW },
    )

    expect(html).toContain('>212<')
    expect(html).toContain('>2<')
    expect(html).toContain('Last checked')
  })

  // A grid of one stretches a single card across the whole page, which reads as a layout bug
  // rather than as a directory with one school in it.
  it('lays a lone school out as a card, not as a full-width band', () => {
    expect(renderPage([school()], { now: NOW })).toContain('class="schools single"')
    expect(
      renderPage(
        [school(), { record: { ...record(), slug: 'other' }, siteUrl: 'https://other.example.org' }],
        { now: NOW },
      ),
    ).toContain('class="schools"')
  })

  // A page that fetches a font or a stylesheet stops rendering the moment this machine is
  // offline -- which is exactly the situation the freshness line has to stay readable in.
  it('depends on nothing it has to download', () => {
    const html = renderPage([school()], { now: NOW })

    expect(html).not.toMatch(/src="https?:\/\//)
    expect(html).not.toMatch(/<link[^>]+href="(?!data:)/)
    expect(html).not.toContain('@import')
  })

  // A long tail of categories would push the freshness line off the card and leave every card
  // in the grid a different height.
  it('counts the categories it does not have room to list', () => {
    const categories = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`Category ${index}`, 9 - index]),
    )
    const html = renderPage([school({ summary: { ...record().summary!, categories } })], {
      now: NOW,
    })

    expect(html).toContain('Category 0')
    expect(html).toContain('+3 more')
    expect(html).not.toContain('Category 8')
  })

  // Every string on this page came from someone else's server. A school that renames itself to
  // a <script> tag must not get to run code in the operator's browser.
  it('escapes everything a school site supplied', () => {
    const hostile: PageSchool = {
      record: record({
        summary: {
          ...record().summary!,
          schoolName: '<script>alert(1)</script>',
          address: '" onmouseover="alert(2)',
          categories: { '<img src=x onerror=alert(3)>': 1 },
        },
      }),
      siteUrl: 'https://mvhs.example.org/"><script>alert(4)</script>',
    }

    const html = renderPage([hostile], { now: NOW })

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('onmouseover="alert(2)')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert(4)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('marks a school stale when the last poll failed, and says why', () => {
    const html = renderPage(
      [
        school({
          lastUpdatedAt: '2026-08-01T12:00:00Z',
          lastError: 'mvhs.example.org answered 503',
        }),
      ],
      { now: NOW },
    )

    expect(html).toContain('class="school stale"')
    expect(html).toContain('8 days ago')
    expect(html).toContain('Last poll failed: mvhs.example.org answered 503')
  })

  it('marks a school stale when nothing has polled it for a while', () => {
    const html = renderPage([school({ lastPolledAt: '2026-08-05T12:00:00Z' })], { now: NOW })

    expect(html).toContain('class="school stale"')
  })

  // A directory that changes weekly is polled hourly and answers 304 almost every time. Judging
  // staleness by content age would brand every healthy school stale and make the signal useless.
  it('does not call a school stale just because its clubs have not changed', () => {
    const html = renderPage(
      [school({ lastUpdatedAt: '2026-07-01T12:00:00Z', lastPolledAt: '2026-08-09T11:59:00Z' })],
      { now: NOW },
    )

    expect(html).not.toContain('class="school stale"')
    expect(html).toContain('39 days ago')
  })

  // Listed but never read is exactly the case that would otherwise go unnoticed for months.
  it('still lists a school that has never been read successfully', () => {
    const html = renderPage(
      [
        {
          record: { ...emptyRecord('newschool'), lastError: 'getaddrinfo ENOTFOUND' },
          siteUrl: 'https://newschool.example.org',
        },
      ],
      { now: NOW },
    )

    expect(html).toContain('newschool')
    expect(html).toContain('No data yet')
    expect(html).toContain('getaddrinfo ENOTFOUND')
    expect(html).toContain('href="https://newschool.example.org"')
  })

  it('sorts schools by name and survives having none', () => {
    const html = renderPage(
      [
        {
          record: record({ summary: { ...record().summary!, schoolName: 'Zebra High' } }),
          siteUrl: 'https://zebra.example.org',
        },
        {
          record: record({ summary: { ...record().summary!, schoolName: 'Alpha High' } }),
          siteUrl: 'https://alpha.example.org',
        },
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
