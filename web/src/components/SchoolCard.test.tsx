import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SchoolCard } from './SchoolCard'
import type { School } from '../types'

const school = (overrides: Partial<School> = {}): School => ({
  slug: 'mvhs',
  siteUrl: 'https://mvhs.example.org',
  host: 'mvhs.example.org',
  demo: false,  location: null,
  status: 'live',
  schoolName: 'Mountain View High School',
  address: null,
  clubCount: 106,
  categories: [{ name: 'STEM', count: 15 }],
  publishedAge: '1 hour ago',
  changedAge: '1 hour ago',
  checkedAge: 'just now',
  publishedAt: null,
  lastUpdatedAt: null,
  lastPolledAt: null,
  lastError: null,
  history: [],
  trend: null,
  ...overrides,
})

describe('SchoolCard', () => {
  it('shows the school clock, not the poller clock', () => {
    render(<SchoolCard school={school({ publishedAge: '3 days ago', changedAge: 'just now' })} onOpen={() => {}} />)

    expect(screen.getByText(/Clubs updated 3 days ago/)).toBeInTheDocument()
    expect(screen.queryByText(/just now/)).not.toBeInTheDocument()
  })

  it('draws a trend only once there are two points to compare', () => {
    const { container, rerender } = render(<SchoolCard school={school()} onOpen={() => {}} />)
    expect(container.querySelector('svg')).toBeNull()

    rerender(
      <SchoolCard
        school={school({
          trend: 6,
          history: [
            { at: '2026-07-20T00:00:00Z', clubCount: 100 },
            { at: '2026-08-09T00:00:00Z', clubCount: 106 },
          ],
        })}
        onOpen={() => {}}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('+6')).toBeInTheDocument()
  })

  // A directory that shrank is worth seeing as clearly as one that grew.
  it('signs a fall as well as a rise', () => {
    render(
      <SchoolCard
        school={school({
          trend: -4,
          history: [
            { at: '2026-07-20T00:00:00Z', clubCount: 110 },
            { at: '2026-08-09T00:00:00Z', clubCount: 106 },
          ],
        })}
        onOpen={() => {}}
      />,
    )

    expect(screen.getByText('-4')).toBeInTheDocument()
  })
})