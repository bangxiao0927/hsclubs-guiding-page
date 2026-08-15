import { useEffect, useState } from 'react'

import type { StatusPayload } from '../types'

const stateColour = (state: StatusPayload['state'] | 'failing') =>
  state === 'healthy' ? 'var(--ok)' : state === 'waiting' ? 'var(--text-faint)' : 'var(--warn)'

export const StatusPage = () => {
  const [payload, setPayload] = useState<StatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/status')
      .then((response) => {
        if (!response.ok) throw new Error(`the server answered ${response.status}`)
        return response.json() as Promise<StatusPayload>
      })
      .then(setPayload)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  return (
    <main className="mx-auto min-h-[calc(100svh-70px)] w-full max-w-[1000px] px-[clamp(1.15rem,4vw,3.5rem)] py-14">
      <a href="/" className="text-[0.9rem] font-semibold text-[var(--accent)]">
        &larr; Directory
      </a>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
        <div>
          <p className="m-0 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Operational status
          </p>
          <h1 className="font-display m-0 mt-2 text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold tracking-[-0.04em]">
            {payload?.summary ?? (error ? 'Status unavailable' : 'Checking...')}
          </h1>
        </div>
        {payload && (
          <span
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[0.78rem] font-bold uppercase tracking-[0.1em]"
            style={{ color: stateColour(payload.state) }}
          >
            <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
            {payload.state}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-7 rounded-xl border border-dashed border-[var(--line-strong)] p-4 text-[var(--warn)]">
          Could not load status: {error}
        </p>
      )}

      {payload && (
        <>
          <section className="mt-8">
            <h2 className="font-display text-lg font-bold">Schools</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {payload.schools.map((school) => (
                <article key={school.slug} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display m-0 font-bold">{school.slug}</h3>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase" style={{ color: stateColour(school.state) }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                      {school.state}
                    </span>
                  </div>
                  <p className="mb-0 mt-3 text-sm text-[var(--text-muted)]">Checked {school.checkedAge}</p>
                  {school.failureStreak > 0 && (
                    <p className="mb-0 mt-1 text-sm text-[var(--warn)]">
                      {school.failureStreak} failed poll{school.failureStreak === 1 ? '' : 's'} in a row
                      {school.error ? `: ${school.error}` : ''}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display m-0 text-lg font-bold">Recent alert transitions</h2>
              <span className="text-xs text-[var(--text-faint)]">Latest 50</span>
            </div>
            {payload.alerts.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-[var(--line)] p-5 text-sm text-[var(--text-muted)]">
                No alert transitions recorded.
              </p>
            ) : (
              <ol className="mt-3 list-none divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-0">
                {payload.alerts.map((alert, index) => (
                  <li key={`${alert.at}-${alert.slug}-${index}`} className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div>
                      <p className="m-0 font-semibold">
                        {alert.slug} {alert.kind === 'recovered' ? 'recovered' : 'started failing'}
                      </p>
                      {alert.error && <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">{alert.error}</p>}
                    </div>
                    <time className="text-xs text-[var(--text-faint)]" dateTime={alert.at}>
                      {new Date(alert.at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  )
}