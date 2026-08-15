import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { School } from '../types'
import { DirectoryNetwork } from './DirectoryNetwork'

const school = (slug: string, name: string, clubs: number, demo = false): School => ({
  slug,
  siteUrl: `https://${slug}.example.org`,
  host: `${slug}.example.org`,
  demo,
  location: null,
  status: 'live',
  schoolName: name,
  address: null,
  clubCount: clubs,
  categories: [{ name: 'STEM', count: 4 }],
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

describe('DirectoryNetwork', () => {
  it('uses the nodes to select which school the live panel describes', async () => {
    const user = userEvent.setup()
    render(
      <DirectoryNetwork
        schools={[school('mvhs', 'Mountain View', 106), school('demo', 'Demo', 55, true)]}
      />,
    )

    const demo = screen.getByRole('button', { name: 'Show Demo' })
    expect(demo).toHaveAttribute('aria-pressed', 'false')

    await user.click(demo)

    expect(demo).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Demonstration')).toBeInTheDocument()
    expect(screen.getByText('55')).toBeInTheDocument()
  })

  it('has an honest empty state while the API is loading', () => {
    render(<DirectoryNetwork schools={[]} />)

    expect(screen.getByText('Waiting for the first verified directory.')).toBeInTheDocument()
    expect(screen.getByText('0 connected')).toBeInTheDocument()
  })
})
