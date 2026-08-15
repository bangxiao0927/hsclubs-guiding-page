import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StatusPage } from './StatusPage'
import type { StatusPayload } from '../types'

const payload: StatusPayload = {
  generatedAt: '2026-08-15T12:00:00Z',
  state: 'degraded',
  summary: '1 school failing',
  schools: [
    { slug: 'a', state: 'healthy', checkedAge: 'just now', failureStreak: 0, error: null },
    { slug: 'b', state: 'failing', checkedAge: '1 hour ago', failureStreak: 3, error: '503' },
  ],
  alerts: [
    { slug: 'b', kind: 'failing', streak: 3, error: '503', at: '2026-08-15T11:00:00Z' },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe('StatusPage', () => {
  it('shows immediate state and persisted alert transitions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })))
    render(<StatusPage />)

    expect(await screen.findByText('1 school failing')).toBeInTheDocument()
    expect(screen.getByText(/3 failed polls in a row: 503/)).toBeInTheDocument()
    expect(screen.getByText('b started failing')).toBeInTheDocument()
  })

  it('explains a status API failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    render(<StatusPage />)

    expect(await screen.findByText(/Could not load status/)).toBeInTheDocument()
  })
})