import type { SortKey } from './filters'

/**
 * Search, sort and filters live in the URL as well as in React state.
 *
 * A directory people are meant to send each other -- "look at these three schools" -- is a
 * directory whose view has to survive a copied link and a reload. The URL is the only place a
 * browser will carry that for free.
 */
export interface ViewState {
  query: string
  sort: SortKey
  categories: string[]
}

const SORTS: SortKey[] = ['name', 'clubs', 'updated']

export const readViewState = (search: string): ViewState => {
  const params = new URLSearchParams(search)
  const sort = params.get('sort')
  const categories = params.get('categories')
  return {
    query: params.get('q') ?? '',
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : 'name',
    categories: categories ? categories.split(',').filter(Boolean) : [],
  }
}

/** Only what differs from the default, so an untouched page keeps a clean address. */
export const writeViewState = ({ query, sort, categories }: ViewState): string => {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query)
  if (sort !== 'name') params.set('sort', sort)
  if (categories.length > 0) params.set('categories', categories.join(','))
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}