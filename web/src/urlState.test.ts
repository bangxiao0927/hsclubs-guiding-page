import { describe, expect, it } from 'vitest'

import { readViewState, writeViewState } from './urlState'

describe('the view state in the URL', () => {
  it('reads what a shared link carries', () => {
    expect(readViewState('?q=mountain&sort=clubs&categories=STEM,Arts')).toEqual({
      query: 'mountain',
      sort: 'clubs',
      categories: ['STEM', 'Arts'],
    })
  })

  // The URL is user input like any other: a hand-edited sort key must not select nothing.
  it('falls back to the default sort rather than trusting the address bar', () => {
    expect(readViewState('?sort=whatever').sort).toBe('name')
    expect(readViewState('').categories).toEqual([])
    expect(readViewState('?categories=').categories).toEqual([])
  })

  it('writes only what differs from the default', () => {
    expect(writeViewState({ query: '', sort: 'name', categories: [] })).toBe('')
    expect(writeViewState({ query: 'demo', sort: 'name', categories: [] })).toBe('?q=demo')
    expect(writeViewState({ query: '', sort: 'updated', categories: ['A', 'B'] })).toBe(
      '?sort=updated&categories=A%2CB',
    )
  })

  it('round-trips whatever it wrote', () => {
    const state = { query: 'los altos', sort: 'clubs' as const, categories: ['STEM & Innovation'] }

    expect(readViewState(writeViewState(state))).toEqual(state)
  })
})