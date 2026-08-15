import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { PagePayload } from './types'

const payload: PagePayload = {
  title: 'HS Clubs',
  generatedAt: '2026-08-15T00:00:00.000Z',
  totals: { schools: 2, clubs: 148, checkedAge: 'just now' },
  schools: [
    {
      slug: 'mvhs',
      siteUrl: 'https://mvhs.example.org',
      host: 'mvhs.example.org',
      status: 'live',
      schoolName: 'Mountain View High School',
      address: '3535 Truman Ave',
      clubCount: 106,
      categories: [
        { name: 'Service', count: 60 },
        { name: 'STEM', count: 15 },
      ],
      updatedAge: '1 hour ago',
      checkedAge: 'just now',
      lastUpdatedAt: '2026-08-14T23:00:00.000Z',
      lastPolledAt: '2026-08-15T00:00:00.000Z',
      lastError: null,
    },
    {
      slug: 'demo-high',
      siteUrl: 'https://demo.example.org',
      host: 'demo.example.org',
      status: 'stale',
      schoolName: 'Demo High School',
      address: null,
      clubCount: 42,
      categories: [{ name: 'Chess', count: 4 }],
      updatedAge: '3 days ago',
      checkedAge: '3 days ago',
      lastUpdatedAt: '2026-08-12T00:00:00.000Z',
      lastPolledAt: '2026-08-12T00:00:00.000Z',
      lastError: 'demo.example.org answered 503',
    },
  ],
}

const answerWith = (body: PagePayload | null, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body })) as unknown as typeof fetch,
  )

afterEach(() => vi.unstubAllGlobals())

describe('the directory page', () => {
  it('lists what the server sent', async () => {
    answerWith(payload)
    render(<App />)

    expect(await screen.findByText('Mountain View High School')).toBeInTheDocument()
    expect(screen.getByText('Demo High School')).toBeInTheDocument()
    // The stale school says so, and says why.
    expect(screen.getByText(/answered 503/)).toBeInTheDocument()
  })

  it('narrows by search and by category, and explains an empty result', async () => {
    answerWith(payload)
    render(<App />)
    const user = userEvent.setup()

    await user.type(await screen.findByPlaceholderText(/search by school/i), 'demo')
    expect(screen.queryByText('Mountain View High School')).not.toBeInTheDocument()
    expect(screen.getByText('Demo High School')).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText(/search by school/i))
    await user.click(screen.getByRole('button', { name: 'STEM' }))
    expect(screen.queryByText('Demo High School')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/search by school/i), 'demo')
    expect(screen.getByText(/no school matches that/i)).toBeInTheDocument()
  })

  it('opens the drawer with everything the card had no room for, and closes on Escape', async () => {
    answerWith(payload)
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Mountain View High School details/ }))

    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByRole('link', { name: /Open mvhs.example.org/ })).toHaveAttribute(
      'href',
      'https://mvhs.example.org',
    )
    expect(within(drawer).getByText('3535 Truman Ave')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // The poller and the page are separate processes; the page has to say so rather than sit empty.
  it('explains a failure to reach the API', async () => {
    answerWith(null, false)
    render(<App />)

    expect(await screen.findByText(/could not load the directories/i)).toBeInTheDocument()
  })
})