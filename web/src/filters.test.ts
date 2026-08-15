import { describe, expect, it } from 'vitest'

import { allCategories, filterByCategories, searchSchools, sortSchools } from './filters'
import type { School } from './types'

const school = (overrides: Partial<School> = {}): School => ({
  slug: 'mvhs',
  siteUrl: 'https://mvhs.example.org',
  host: 'mvhs.example.org',
  status: 'live',
  schoolName: 'Mountain View High School',
  address: null,
  clubCount: 106,
  categories: [
    { name: 'STEM', count: 15 },
    { name: 'Service', count: 60 },
  ],
  publishedAge: '1 hour ago',
      changedAge: '1 hour ago',
  checkedAge: 'just now',
      publishedAt: null,
  lastUpdatedAt: '2026-08-09T11:00:00Z',
  lastPolledAt: '2026-08-09T11:59:00Z',
  lastError: null,
  ...overrides,
})

describe('searchSchools', () => {
  it('matches the two things a visitor can see: the name and the host', () => {
    const schools = [
      school(),
      school({ slug: 'lahs', schoolName: 'Los Altos', host: 'lahs.example.org' }),
    ]

    expect(searchSchools(schools, 'mountain').map((s) => s.slug)).toEqual(['mvhs'])
    expect(searchSchools(schools, 'LAHS.EXAMPLE').map((s) => s.slug)).toEqual(['lahs'])
    expect(searchSchools(schools, '   ')).toHaveLength(2)
  })

  // A school that has never been read has no name; it must still be findable and listable.
  it('falls back to the slug when a school has no name yet', () => {
    const schools = [school({ slug: 'newschool', schoolName: null, clubCount: null, categories: [] })]

    expect(searchSchools(schools, 'newschool')).toHaveLength(1)
  })
})

describe('filterByCategories', () => {
  it('requires every selected category, so narrowing narrows', () => {
    const schools = [school(), school({ slug: 'arts', categories: [{ name: 'STEM', count: 3 }] })]

    expect(filterByCategories(schools, ['STEM']).map((s) => s.slug)).toEqual(['mvhs', 'arts'])
    expect(filterByCategories(schools, ['STEM', 'Service']).map((s) => s.slug)).toEqual(['mvhs'])
    expect(filterByCategories(schools, [])).toHaveLength(2)
  })
})

describe('sortSchools', () => {
  const a = school({
    slug: 'a',
    schoolName: 'Alpha',
    clubCount: 10,
    lastUpdatedAt: '2026-01-01T00:00:00Z',
  })
  const b = school({
    slug: 'b',
    schoolName: 'Beta',
    clubCount: 90,
    lastUpdatedAt: '2026-06-01T00:00:00Z',
  })
  const c = school({ slug: 'c', schoolName: 'Gamma', clubCount: null, lastUpdatedAt: null })

  it('orders by name, club count, or recency', () => {
    expect(sortSchools([b, c, a], 'name').map((s) => s.slug)).toEqual(['a', 'b', 'c'])
    expect(sortSchools([a, c, b], 'clubs').map((s) => s.slug)).toEqual(['b', 'a', 'c'])
    expect(sortSchools([a, c, b], 'updated').map((s) => s.slug)).toEqual(['b', 'a', 'c'])
  })

  it('does not mutate the list it was given', () => {
    const list = [b, a]
    sortSchools(list, 'name')
    expect(list.map((s) => s.slug)).toEqual(['b', 'a'])
  })
})

describe('allCategories', () => {
  it('collects every category once, in alphabetical order', () => {
    expect(allCategories([school(), school({ categories: [{ name: 'Arts', count: 1 }] })])).toEqual([
      'Arts',
      'Service',
      'STEM',
    ])
  })
})