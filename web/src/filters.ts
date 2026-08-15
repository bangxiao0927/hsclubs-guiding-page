import type { School } from './types'

export type SortKey = 'name' | 'clubs' | 'updated'

export const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  clubs: 'Most clubs',
  updated: 'Recently updated',
}

export const displayName = (school: School): string => school.schoolName ?? school.slug

/**
 * Search, filter and sort, kept out of the components so the rules are testable on their own.
 *
 * Matching is on the school name and the host, because those are the two things a visitor can
 * actually see on a card; matching hidden fields would make the empty state inexplicable.
 */
export const searchSchools = (schools: School[], query: string): School[] => {
  const needle = query.trim().toLowerCase()
  if (!needle) return schools
  return schools.filter((school) =>
    [displayName(school), school.host].some((value) => value.toLowerCase().includes(needle)),
  )
}

export const filterByCategories = (schools: School[], selected: string[]): School[] => {
  if (selected.length === 0) return schools
  // Every selected category has to be present: narrowing should narrow.
  return schools.filter((school) =>
    selected.every((name) => school.categories.some((category) => category.name === name)),
  )
}

export const sortSchools = (schools: School[], key: SortKey): School[] => {
  const list = [...schools]
  if (key === 'clubs') {
    return list.sort(
      (a, b) => (b.clubCount ?? -1) - (a.clubCount ?? -1) || displayName(a).localeCompare(displayName(b)),
    )
  }
  if (key === 'updated') {
    // A school that has never reported goes last rather than pretending to be from 1970.
    const at = (school: School) => Date.parse(school.lastUpdatedAt ?? '') || -Infinity
    return list.sort((a, b) => at(b) - at(a) || displayName(a).localeCompare(displayName(b)))
  }
  return list.sort((a, b) => displayName(a).localeCompare(displayName(b)))
}

export const allCategories = (schools: School[]): string[] =>
  [...new Set(schools.flatMap((school) => school.categories.map((category) => category.name)))].sort(
    (a, b) => a.localeCompare(b),
  )