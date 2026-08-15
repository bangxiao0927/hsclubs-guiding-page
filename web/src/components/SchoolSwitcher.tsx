import { useEffect, useRef } from 'react'

import { displayName } from '../filters'
import type { School } from '../types'
import { DemoBadge, StatusBadge } from './StatusBadge'

const initials = (school: School) =>
  displayName(school)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

/**
 * One place to move between this guide and the independent school apps.
 *
 * The school links leave this origin by design, so each one names its host before someone taps
 * it. The guide is the first item and current: the panel is an app switcher, not a menu that
 * pretends all of the destinations belong to this app.
 */
export const SchoolSwitcher = ({
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
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Close app switcher"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45 backdrop-blur-[3px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="switcher-title"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[82svh] overflow-y-auto rounded-t-[28px] border border-[var(--line)] bg-[var(--canvas)] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_80px_rgba(0,0,0,.35)] outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:p-6"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line-strong)] sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
              App switcher
            </p>
            <h2 id="switcher-title" className="font-display m-0 mt-1 text-xl font-extrabold tracking-[-0.03em]">
              Choose a directory
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close app switcher"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface)] text-lg hover:border-[var(--line-strong)]"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>

        <div className="mt-5 grid gap-2">
          <a
            href="/"
            onClick={onClose}
            className="group flex items-center gap-3 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-2)] p-3.5 transition hover:-translate-y-px"
          >
            <span className="font-display grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-140 from-[var(--accent)] to-[var(--accent-2)] text-sm font-extrabold text-white shadow-lg">
              HS
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display block font-bold">HS Clubs Guide</span>
              <span className="block truncate text-xs text-[var(--text-faint)]">clubs.bangxiao.net</span>
            </span>
            <span className="rounded-full bg-[var(--accent)]/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
              Current
            </span>
          </a>

          {schools.map((school) => (
            <a
              key={school.slug}
              href={school.siteUrl}
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 transition hover:-translate-y-px hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
            >
              <span className="font-display grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-extrabold text-[var(--accent)]">
                {initials(school)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display flex items-center gap-2 font-bold">
                  <span className="truncate">{displayName(school)}</span>
                  {school.demo && <DemoBadge />}
                </span>
                <span className="block truncate text-xs text-[var(--text-faint)]">{school.host}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={school.status} />
                <span className="text-xs text-[var(--text-faint)]">
                  {school.clubCount ?? 0} clubs <span aria-hidden>&#8599;</span>
                </span>
              </span>
            </a>
          ))}
        </div>

        <p className="mb-0 mt-4 text-center text-xs text-[var(--text-faint)]">
          Each school runs its own app. The guide only points you there.
        </p>
      </div>
    </div>
  )
}
