import { describe, expect, it } from 'vitest'

import { parseSummary, SummaryFormatError } from './summary.js'

const valid = {
  schoolName: 'Mountain View High School',
  shortName: 'MVHS',
  slug: 'mvhs',
  address: null,
  status: 'active',
  clubCount: 106,
  categories: { 'STEM & Innovation': 15, 'Service & Leadership': 60 },
  memberCount: 4,
  lastUpdatedAt: '2026-08-08T21:41:31.064406-07:00',
  dataHash: '5907928d',
}

describe('parseSummary', () => {
  it('accepts a summary from a school site', () => {
    expect(parseSummary(valid)).toMatchObject({ slug: 'mvhs', clubCount: 106, memberCount: 4 })
  })

  it('accepts a null address and a null lastUpdatedAt', () => {
    const summary = parseSummary({ ...valid, address: null, lastUpdatedAt: null })
    expect(summary.address).toBeNull()
    expect(summary.lastUpdatedAt).toBeNull()
  })

  // A school running a newer version must not become unreadable here.
  it('ignores fields it does not know about', () => {
    expect(parseSummary({ ...valid, region: 'Bay Area', futureThing: [1, 2, 3] }).slug).toBe('mvhs')
  })

  // The producer publishes an offset precisely so schools in different zones are comparable;
  // storing a value without one would silently produce a wrong ordering on the page.
  it('rejects a timestamp with no offset', () => {
    expect(() => parseSummary({ ...valid, lastUpdatedAt: '2026-08-08T21:41:31' })).toThrow(
      SummaryFormatError,
    )
  })

  it('accepts a UTC timestamp written with Z', () => {
    expect(parseSummary({ ...valid, lastUpdatedAt: '2026-08-08T21:41:31Z' }).lastUpdatedAt).toBe(
      '2026-08-08T21:41:31Z',
    )
  })

  it.each([
    ['a missing schoolName', { ...valid, schoolName: undefined }],
    ['a blank slug', { ...valid, slug: '  ' }],
    ['a negative club count', { ...valid, clubCount: -1 }],
    ['a fractional member count', { ...valid, memberCount: 1.5 }],
    ['a category count that is not a number', { ...valid, categories: { STEM: 'many' } }],
    ['a body that is an array', [valid]],
    ['a body that is a string', 'nope'],
  ])('rejects %s', (_label, body) => {
    expect(() => parseSummary(body)).toThrow(SummaryFormatError)
  })
})
