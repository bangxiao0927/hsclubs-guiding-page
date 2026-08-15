import { useEffect, useMemo, useState } from 'react'

import { displayName } from '../filters'
import type { School } from '../types'
import { DemoBadge, StatusBadge } from './StatusBadge'

const POSITIONS = [
  { x: 14, y: 22 },
  { x: 84, y: 27 },
  { x: 80, y: 76 },
  { x: 18, y: 73 },
  { x: 50, y: 9 },
  { x: 50, y: 88 },
]

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A live view of the hand-off this product performs: one guide, several independent schools.
 *
 * It auto-rotates only while nobody is interacting with it and motion is allowed. The node
 * buttons are the control as well as the picture, so the same information is keyboard reachable
 * and the animation never becomes the only way to select a school.
 */
export const DirectoryNetwork = ({ schools }: { schools: School[] }) => {
  const visible = useMemo(() => schools.slice(0, POSITIONS.length), [schools])
  const [activeSlug, setActiveSlug] = useState<string | null>(visible[0]?.slug ?? null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!visible.some((school) => school.slug === activeSlug)) {
      setActiveSlug(visible[0]?.slug ?? null)
    }
  }, [activeSlug, visible])

  useEffect(() => {
    if (paused || visible.length < 2 || prefersReducedMotion()) return
    const timer = window.setInterval(() => {
      setActiveSlug((current) => {
        const index = visible.findIndex((school) => school.slug === current)
        return visible[(index + 1) % visible.length]?.slug ?? null
      })
    }, 4200)
    return () => window.clearInterval(timer)
  }, [paused, visible])

  const active = visible.find((school) => school.slug === activeSlug) ?? visible[0] ?? null

  return (
    <aside
      aria-label="Directory network"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
      }}
      className="card-edge relative isolate min-h-[430px] overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] backdrop-blur-xl sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Directory network
          </p>
          <p className="font-display m-0 mt-1 text-[1.05rem] font-bold">Independent. Verified. Live.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--text-muted)]">
          <span className="pulse-ring relative h-1.5 w-1.5 rounded-full bg-[var(--ok)] text-[var(--ok)]" aria-hidden />
          {schools.length} connected
        </span>
      </div>

      <div className="relative mx-auto mt-3 h-[245px] max-w-[440px]" aria-hidden={visible.length === 0}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="network-line" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.5" />
              <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          {visible.map((school, index) => {
            const position = POSITIONS[index]!
            return (
              <line
                key={school.slug}
                x1="50"
                y1="50"
                x2={position.x}
                y2={position.y}
                stroke="url(#network-line)"
                strokeWidth={school.slug === active?.slug ? 0.75 : 0.4}
                strokeDasharray={school.slug === active?.slug ? '0' : '2 2'}
                className="transition-all duration-500"
              />
            )
          })}
        </svg>

        <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] shadow-[0_0_50px_var(--glow-1)]">
          <span className="font-display gradient-text text-xl font-extrabold">HS</span>
          <span className="absolute inset-[-9px] animate-[spin_18s_linear_infinite] rounded-full border border-dashed border-[var(--line-strong)] motion-reduce:animate-none" />
        </div>

        {visible.map((school, index) => {
          const position = POSITIONS[index]!
          const selected = school.slug === active?.slug
          return (
            <button
              key={school.slug}
              type="button"
              onClick={() => setActiveSlug(school.slug)}
              aria-label={`Show ${displayName(school)}`}
              aria-pressed={selected}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-xl border px-3 py-2 text-left shadow-lg backdrop-blur transition duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                selected
                  ? 'scale-105 border-[var(--line-strong)] bg-[var(--surface-2)]'
                  : 'border-[var(--line)] bg-[var(--surface)] opacity-70 hover:scale-105 hover:opacity-100'
              }`}
            >
              <span className="block max-w-[110px] truncate text-[0.72rem] font-semibold">{displayName(school)}</span>
              <span className="mt-0.5 block text-[0.62rem] text-[var(--text-faint)]">
                {school.clubCount ?? 0} clubs
              </span>
            </button>
          )
        })}
      </div>

      {active ? (
        <div key={active.slug} className="animate-[network-in_400ms_cubic-bezier(.22,1,.36,1)] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="m-0 text-[0.72rem] text-[var(--text-faint)]">{active.host}</p>
              <p className="font-display m-0 mt-0.5 text-base font-bold">{displayName(active)}</p>
            </div>
            <span className="flex items-center gap-2">
              {active.demo && <DemoBadge />}
              <StatusBadge status={active.status} />
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <p className="m-0 text-xs text-[var(--text-faint)]">
              <b className="font-display mr-1 text-2xl font-extrabold text-[var(--text)]">{active.clubCount ?? 0}</b>
              clubs across {active.categories.length} categories
            </p>
            <span className="text-xs font-semibold text-[var(--accent)]">Updated {active.publishedAge}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--text-muted)]">
          Waiting for the first verified directory.
        </div>
      )}
    </aside>
  )
}
