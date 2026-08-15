import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    expect(screen.getByRole('button', { name: 'Alpha High' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Beta High' })).not.toBeInTheDocument()
    // A school without coordinates is reported, never pinned to a guess.
    expect(screen.getByText('1 school awaiting a confirmed location')).toBeInTheDocument()
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

    const world = landPath()
    await user.click(screen.getByRole('button', { name: 'Beta High' }))
    expect(screen.getByRole('button', { name: 'Beta High' })).toHaveAttribute('aria-pressed', 'true')
    // The globe rotation is animated, so the projected land arrives over the next frames.
    await waitFor(() => expect(landPath()).not.toBe(world))

    await user.click(screen.getByRole('button', { name: 'Resume tour' }))
    expect(screen.getByRole('heading', { name: 'Alpha High' })).toBeInTheDocument()
    await waitFor(() => expect(landPath()).toBe(world))
  })

  it('rotates when dragged and hands control back to the person dragging', async () => {
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', { lat: 35.7, lon: 139.7 }),
        ]}
      />,
    )
    const globe = screen.getByRole('application')
    globe.setPointerCapture = () => {}
    const before = landPath()

    fireEvent.pointerDown(globe, { pointerId: 1, clientX: 400, clientY: 300, button: 0 })
    fireEvent.pointerMove(globe, { pointerId: 1, clientX: 520, clientY: 330 })

    // The drag itself moves the camera; it does not wait for a tween to catch up.
    expect(landPath()).not.toBe(before)

    // Taking hold of the globe also takes over from the tour, so the camera cannot be yanked
    // away mid-gesture. (Release behaviour -- inertia and clearing the focus -- needs full
    // Pointer Event semantics and is covered against a real browser instead of jsdom.)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume tour' })).toBeInTheDocument())
  })

  it('rotates with the arrow keys for anyone not using a pointer', () => {
    render(<SchoolMap schools={[school('a', 'Alpha High', { lat: 37.4, lon: -122.1 })]} />)
    const globe = screen.getByRole('application')
    const before = landPath()

    fireEvent.keyDown(globe, { key: 'ArrowRight' })

    expect(landPath()).not.toBe(before)
  })

  it('moves focus between schools as a tour until someone interacts', async () => {
    vi.useFakeTimers()
    render(
      <SchoolMap
        schools={[
          school('a', 'Alpha High', { lat: 37.4, lon: -122.1 }),
          school('b', 'Beta High', { lat: 35.7, lon: 139.7 }),
        ]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Alpha High' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await vi.advanceTimersByTimeAsync(5_200)
    expect(screen.getByRole('button', { name: 'Beta High' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
