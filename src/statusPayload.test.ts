import { describe, expect, it } from 'vitest'

import { buildStatusPayload } from './statusPayload.js'
import { emptyRecord } from './store.js'

const NOW = new Date('2026-08-15T12:00:00Z')

describe('buildStatusPayload', () => {
  it('is healthy when every polled school is answering', () => {
    const payload = buildStatusPayload(
      [{ ...emptyRecord('a'), lastPolledAt: '2026-08-15T11:59:00Z' }],
      [], NOW,
    )
    expect(payload.state).toBe('healthy')
    expect(payload.summary).toBe('All 1 schools answering')
  })

  // Display state is immediate; alerting has its own threshold.
  it('is degraded on the first failure, before an alert is due', () => {
    const payload = buildStatusPayload(
      [{ ...emptyRecord('a'), lastPolledAt: '2026-08-15T11:00:00Z', failureStreak: 1, lastError: '503' }],
      [], NOW,
    )
    expect(payload.state).toBe('degraded')
    expect(payload.schools[0]).toMatchObject({ state: 'failing', failureStreak: 1, error: '503' })
  })

  it('distinguishes a school waiting for its first poll', () => {
    const payload = buildStatusPayload([emptyRecord('new')], [], NOW)
    expect(payload.state).toBe('waiting')
    expect(payload.schools[0]?.checkedAge).toBe('never')
  })
})