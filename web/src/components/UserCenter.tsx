import { useEffect, useRef } from 'react'

import { displayName } from '../filters'
import type { School } from '../types'
import { StatusBadge } from './StatusBadge'

const profileUrl = (school: School) => new URL('/profile', school.siteUrl).href

/**
 * Accounts belong to school apps, never to this guide.
 *
 * The panel is called a user centre because that is what the launcher promises, but it does not
 * manufacture a central identity: it shows the real school apps where a profile can exist and
 * says plainly that signing in to one does not sign in to another.
 */
export const UserCenter = ({
  schools,
  open,
  onClose,
}: {
  schools: School[]
  open: boolean
  onClose: () => void
}) => {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const realSchools = schools.filter((school) => !school.demo)

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      ;(opener.current as HTMLElement | null)?.focus?.()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close user center"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45 backdrop-blur-[3px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-center-title"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[82svh] overflow-y-auto rounded-t-[28px] border border-[var(--line)] bg-[var(--canvas)] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_80px_rgba(0,0,0,.35)] outline-none sm:left-auto sm:right-6 sm:top-[78px] sm:w-[420px] sm:rounded-[24px] sm:p-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line-strong)] sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
              User center
            </p>
            <h2 id="user-center-title" className="font-display m-0 mt-1 text-xl font-extrabold tracking-[-0.03em]">
              Choose your school account
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close user center"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface)] text-lg hover:border-[var(--line-strong)]"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>

        <p className="mb-0 mt-3 text-sm text-[var(--text-muted)]">
          Profiles live with each school. This guide does not hold an account or share a login
          between schools.
        </p>

        <div className="mt-5 grid gap-2">
          {realSchools.map((school) => (
            <a
              key={school.slug}
              href={profileUrl(school)}
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 transition hover:-translate-y-px hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-140 from-[var(--accent)] to-[var(--accent-2)] text-white shadow-lg">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="8" r="3.25" />
                  <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block truncate font-bold">{displayName(school)}</span>
                <span className="block truncate text-xs text-[var(--text-faint)]">{school.host}/profile</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={school.status} />
                <span className="text-xs font-semibold text-[var(--accent)]">
                  Open <span aria-hidden>&#8599;</span>
                </span>
              </span>
            </a>
          ))}

          {realSchools.length === 0 && (
            <p className="m-0 rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--text-muted)]">
              No participating school account is available yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}