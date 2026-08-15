import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { School } from '../types'
import { SchoolSwitcher } from './SchoolSwitcher'

const demo: School = {
  slug: 'demo',
  siteUrl: 'https://demo.example.org',
  host: 'demo.example.org',
  demo: true,  location: null,
  status: 'live',
  schoolName: 'Demo',
  address: null,
  clubCount: 55,
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
}

describe('SchoolSwitcher', () => {
  it('separates the current guide from external school apps', () => {
    render(<SchoolSwitcher schools={[demo]} open onClose={() => {}} />)

    expect(screen.getByRole('link', { name: /HS Clubs Guide/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /Demo/ })).toHaveAttribute(
      'href',
      'https://demo.example.org',
    )
    expect(screen.getByText('Demonstration')).toBeInTheDocument()
    expect(screen.getByText(/Each school runs its own app/)).toBeInTheDocument()
  })

  it('closes on Escape and gives focus back to the launcher', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <>
        <button type="button">Launcher</button>
        <SchoolSwitcher schools={[demo]} open={false} onClose={onClose} />
      </>,
    )
    const launcher = screen.getByRole('button', { name: 'Launcher' })
    launcher.focus()
    rerender(
      <>
        <button type="button">Launcher</button>
        <SchoolSwitcher schools={[demo]} open onClose={onClose} />
      </>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()

    rerender(
      <>
        <button type="button">Launcher</button>
        <SchoolSwitcher schools={[demo]} open={false} onClose={onClose} />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Launcher' })).toHaveFocus())
  })
})