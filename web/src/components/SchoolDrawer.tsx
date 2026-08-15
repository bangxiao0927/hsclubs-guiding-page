import { useEffect, useRef } from 'react'

import { displayName } from '../filters'
import type { School } from '../types'
import { Sparkline } from './Sparkline'
import { StatusBadge } from './StatusBadge'

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2 last:border-0">
    <span className="text-[0.82rem] uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</span>
    <span className="text-right text-[0.92rem]">{value}</span>
  </div>
)

/**
 * Everything the card had no room for, plus the one link that leaves.
 *
 * Escape closes it, the backdrop closes it, and focus moves to the panel on open and is put back
 * where it came from on close -- a panel that traps a keyboard user is worse than no panel.
 */
export const SchoolDrawer = ({ school, onClose }: { school: School | null; onClose: () => void }) => {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    if (!school) return
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
  }, [school, onClose])

  if (!school) return null

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName(school)} details`}
        tabIndex={-1}
        className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col gap-4 overflow-y-auto border-l border-[var(--line)] bg-[var(--canvas)] p-7 shadow-[var(--shadow)] outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[0.82rem] text-[var(--text-faint)]">{school.host}</p>
            <h2 className="font-display m-0 mt-1 text-[1.75rem] font-extrabold tracking-[-0.03em]">
              {displayName(school)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="h-9 w-9 shrink-0 cursor-pointer rounded-[10px] border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--line-strong)]"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={school.status} />
          {school.clubCount !== null && (
            <span className="text-[0.9rem] text-[var(--text-muted)]">
              <b className="font-display text-[1.1rem]">{school.clubCount}</b> clubs
            </span>
          )}
        </div>

        {school.lastError && (
          <p className="m-0 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[0.88rem] text-[var(--warn)]">
            Last poll failed: {school.lastError}
          </p>
        )}

        {school.categories.length > 0 && (
          <div>
            <h3 className="font-display m-0 mb-2 text-[0.95rem] font-bold">
              Categories ({school.categories.length})
            </h3>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {school.categories.map((category) => (
                <li
                  key={category.name}
                  className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[0.8rem] text-[var(--text-muted)]"
                >
                  {category.name}
                  <b className="tabular-nums text-[var(--text)]">{category.count}</b>
                </li>
              ))}
            </ul>
          </div>
        )}

        {school.history.length >= 2 && (
          <div>
            <h3 className="font-display m-0 mb-1 text-[0.95rem] font-bold">
              Clubs over the last month
            </h3>
            <div className="flex items-center gap-3">
              <Sparkline points={school.history} className="h-10 w-full" />
              <span className="shrink-0 text-[0.85rem] text-[var(--text-faint)]">
                {school.history[0]?.clubCount} &rarr; {school.history[school.history.length - 1]?.clubCount}
              </span>
            </div>
          </div>
        )}

        <div className="mt-1">
          {school.address && <Row label="Address" value={school.address} />}
          <Row label="Clubs updated" value={school.publishedAge} />
          <Row label="Change seen here" value={school.changedAge} />
          <Row label="Last checked" value={school.checkedAge} />
          <Row label="Slug" value={school.slug} />
        </div>

        <a
          href={school.siteUrl}
          rel="noopener noreferrer"
          className="font-display mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-linear-140 from-[var(--accent)] to-[var(--accent-2)] px-5 py-3 text-[0.95rem] font-bold text-white shadow-[0_16px_34px_-14px_var(--accent)] transition hover:-translate-y-0.5"
        >
          Open {school.host} <span aria-hidden>&rarr;</span>
        </a>
      </div>
    </div>
  )
}