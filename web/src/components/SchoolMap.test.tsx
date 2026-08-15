import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { School } from '../types'
import { SchoolMap } from './SchoolMap'

const school = (slug: string, name: string, location: School['location']): School => ({
  slug,
  siteUrl: `https://${slug}.example.org`,
  host: `${slug}.example.org`,
  demo: false,
  location,
  status: 'live',
  schoolName: name,
  address: null,
  clubCount: 40,
  categories: [],
  publishedAge: '1 hour ago',
  changedAge: '1 hour ago',
  checkedAge: 'just now',
  publishedAt: null,
  lastUpdatedAt: null,
  lastPolledAt: null,
  lastError: null,
  history: [],
  trend: null,
})

const viewBox = () => screen.getByRole('img').getAttribute('viewBox')

describe('SchoolMap', () => {
  it('plots only schools with confirmed coordinates and counts the rest', () => {
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', null),
        ]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Alpha High' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Beta High' })).not.toBeInTheDocument()
    // A school without coordinates is reported, never pinned to a guess.
    expect(screen.getByText('1 school without a confirmed location')).toBeInTheDocument()
  })

  it('zooms to a school when its pin is chosen and restores the overview', async () => {
    const user = userEvent.setup()
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', { lat: 51.5, lon: -0.1 }),
        ]}
      />,
    )

    const world = viewBox()
    await user.click(screen.getByRole('button', { name: 'Beta High' }))
    expect(screen.getByRole('button', { name: 'Beta High' })).toHaveAttribute('aria-pressed', 'true')
    // The pan/zoom is animated, so the viewport arrives over the next frames.
    await waitFor(() => expect(viewBox()).not.toBe(world))

    await user.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(screen.getByText('2 mapped schools')).toBeInTheDocument()
    await waitFor(() => expect(viewBox()).toBe(world))
  })
})
