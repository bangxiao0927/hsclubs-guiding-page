import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { School } from '../types'
import { UserCenter } from './UserCenter'

const school = (slug: string, name: string, demo = false): School => ({
  slug,
  siteUrl: `https://${slug}.example.org`,
  host: `${slug}.example.org`,
  demo,
  location: null,
  status: 'live',
  schoolName: name,
  address: null,
  clubCount: 1,
  categories: [],
  publishedAge: 'now',
  changedAge: 'now',
  checkedAge: 'now',
  publishedAt: null,
  lastUpdatedAt: null,
  lastPolledAt: null,
  lastError: null,
  history: [],
  trend: null,
})

describe('UserCenter', () => {
  it('links to the profile owned by each real school', () => {
    render(
      <UserCenter
        schools={[school('mvhs', 'Mountain View'), school('demo', 'Demo', true)]}
        open
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('link', { name: /Mountain View/ })).toHaveAttribute(
      'href',
      'https://mvhs.example.org/profile',
    )
    // A fixture has no real user account and must not be offered as one.
    expect(screen.queryByRole('link', { name: /Demo/ })).not.toBeInTheDocument()
    expect(screen.getByText(/does not hold an account/)).toBeInTheDocument()
  })
})