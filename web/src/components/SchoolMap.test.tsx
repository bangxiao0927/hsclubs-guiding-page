import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

const landPath = () => screen.getByTestId('globe-land').getAttribute('d')
const pin = (name: string | RegExp) => screen.getByRole('link', { name })

describe('SchoolMap', () => {
  afterEach(() => vi.useRealTimers())

  it('plots only schools with confirmed coordinates and counts the rest', () => {
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', null),
        ]}
      />,
    )

    expect(pin(/Alpha High/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Beta High/ })).not.toBeInTheDocument()
    // A school without coordinates is reported, never pinned to a guess.
    expect(screen.getByText('1 school awaiting a confirmed location')).toBeInTheDocument()
  })

  // The guide's job is to hand off: a pin goes straight to the school's own origin.
  it('links each pin to the school site rather than trapping the visitor', () => {
    render(<SchoolMap schools={[school('a', 'Alpha High', { lat: 37.4, lon: -122.1 })]} />)

    const link = pin(/Alpha High/)
    expect(link).toHaveAttribute('href', 'https://a.example.org')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  // Rotating right must carry the surface right; jsdom lacks pointer coordinates, so the honest
  // check is that the arrow keys move a pin the same way.
  it('rotates the surface with the input, not against it', () => {
    render(<SchoolMap schools={[school('a', 'Alpha High', { lat: 0, lon: 0 })]} />)
    const globe = screen.getByRole('application')
    const left = () => Number.parseFloat(pin(/Alpha High/).style.left)
    const before = left()

    fireEvent.keyDown(globe, { key: 'ArrowRight' })

    expect(left()).toBeGreaterThan(before)
  })

  it('zooms the globe with the on-screen controls', () => {
    render(<SchoolMap schools={[school('a', 'Alpha High', { lat: 0, lon: 0 })]} />)
    const before = landPath()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

    expect(landPath()).not.toBe(before)
  })

  // One unusable value would project every coordinate to NaN and blank the entire globe.
  it('refuses a camera it cannot draw', () => {
    render(<SchoolMap schools={[school('a', 'Alpha High', { lat: 0, lon: 0 })]} />)
    const globe = screen.getByRole('region', { name: 'School map' })
    const before = landPath()

    fireEvent.pointerDown(globe, { pointerId: 1, button: 0 })
    fireEvent.pointerMove(globe, { pointerId: 1 })

    expect(landPath()).toBe(before)
    expect(landPath()).not.toContain('NaN')
    expect(pin(/Alpha High/)).toBeInTheDocument()
  })

  // Releasing a hand-drag used to snap back to the mean of the schools -- the empty hemisphere
  // between California and Tokyo. A free rotation must stay where it is left.
  it('does not snap back to an overview after the arrow keys rotate it', async () => {
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', { lat: 35.7, lon: 139.7 }),
        ]}
      />,
    )
    const globe = screen.getByRole('application')
    fireEvent.keyDown(globe, { key: 'ArrowRight' })
    const settled = landPath()

    await waitFor(() => {
      expect(landPath()).toBe(settled)
      expect(screen.getByRole('heading').textContent).toBe('Find a school directory')
    })
  })

  it('tours between schools until someone interacts', async () => {
    vi.useFakeTimers()
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', { lat: 35.7, lon: 139.7 }),
        ]}
      />,
    )

    expect(pin(/Alpha High/)).toHaveAttribute('aria-current', 'true')
    await vi.advanceTimersByTimeAsync(5_200)
    expect(pin(/Beta High/)).toHaveAttribute('aria-current', 'true')
  })

  // A page left open should keep moving: a rotation hands back to the tour a few seconds later.
  it('resumes the tour a few seconds after the last interaction', async () => {
    vi.useFakeTimers()
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', { lat: 35.7, lon: 139.7 }),
        ]}
      />,
    )
    const globe = screen.getByRole('application')

    // Rotate by hand: no school is active and the tour is paused.
    fireEvent.keyDown(globe, { key: 'ArrowRight' })
    expect(screen.getByRole('heading').textContent).toBe('Find a school directory')

    // Idle for three seconds and the tour takes back over.
    await vi.advanceTimersByTimeAsync(3_000)
    expect(screen.getByRole('heading').textContent).toBe('Alpha High')
  })
})
