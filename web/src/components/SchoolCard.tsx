import type { PointerEvent } from 'react'

import { displayName } from '../filters'
import type { School } from '../types'
import { Sparkline } from './Sparkline'
import { StatusBadge } from './StatusBadge'

const MAX_CATEGORIES = 6

/**
 * The card opens the detail drawer rather than the school site.
 *
 * A card that navigated away would make the categories and the failure reason unreachable, and
 * the drawer is where the "Open site" link lives -- one deliberate step to leave, instead of a
 * whole surface that leaves by accident.
 */
export const SchoolCard = ({ school, onOpen }: { school: School; onOpen: (school: School) => void }) => {
  const shown = school.categories.slice(0, MAX_CATEGORIES)
  const hidden = school.categories.length - shown.length

  const spotlight = (event: PointerEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`)
    event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`)
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(school)}
      onPointerMove={spotlight}
      aria-label={`${displayName(school)} details`}
      className={`card-edge spotlight group relative isolate flex cursor-pointer flex-col gap-2.5 rounded-[20px] border bg-[var(--surface)] p-6 text-left shadow-[var(--shadow)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-[var(--line-strong)] focus-visible:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)] ${
        school.status === 'live' ? 'border-[var(--line)]' : 'border-dashed border-[var(--line)]'
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[0.82rem] text-[var(--text-faint)]">{school.host}</span>
        <StatusBadge status={school.status} />
      </span>
      <h3 className="font-display m-0 text-[1.35rem] font-bold tracking-[-0.025em] transition-colors group-hover:text-[var(--accent)]">
        {displayName(school)}
      </h3>
      {school.address && <p className="m-0 text-[0.9rem] text-[var(--text-muted)]">{school.address}</p>}
      {school.clubCount === null ? (
        <p className="m-0 text-[0.85rem] text-[var(--warn)]">
          No data yet. {school.lastError ?? 'Never polled.'}
        </p>
      ) : (
        <>
          <span className="mt-1 flex items-end justify-between gap-3">
            <span className="flex items-baseline gap-2 text-[0.9rem] text-[var(--text-faint)]">
              <b className="font-display gradient-text text-[2.7rem] font-extrabold leading-none tracking-[-0.045em] tabular-nums">
                {school.clubCount}
              </b>
              clubs
              {school.trend !== null && school.trend !== 0 && (
                <span className={school.trend > 0 ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}>
                  {school.trend > 0 ? '+' : ''}
                  {school.trend}
                </span>
              )}
            </span>
            <Sparkline points={school.history} className="mb-1 shrink-0 opacity-80" />
          </span>
          <ul className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
            {shown.map((category) => (
              <li
                key={category.name}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[0.78rem] text-[var(--text-muted)]"
              >
                {category.name}
                <b className="tabular-nums text-[var(--text)]">{category.count}</b>
              </li>
            ))}
            {hidden > 0 && (
              <li className="inline-flex items-center rounded-[9px] border border-dashed border-[var(--line)] px-2.5 py-1 text-[0.78rem] text-[var(--text-faint)]">
                +{hidden} more
              </li>
            )}
          </ul>
        </>
      )}
      {school.lastError && school.clubCount !== null && (
        <p className="m-0 text-[0.85rem] text-[var(--warn)]">Last poll failed: {school.lastError}</p>
      )}
      <span className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3.5 text-[0.86rem]">
        <span className="text-[var(--text-faint)]">Clubs updated {school.publishedAge}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-semibold text-[var(--accent)]">
          Details
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
            &rarr;
          </span>
        </span>
      </span>
    </button>
  )
}