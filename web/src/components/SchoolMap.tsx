import { useEffect, useMemo, useRef, useState } from 'react'

import { displayName } from '../filters'
import type { School } from '../types'
import land from '../data/land.json'
import { DemoBadge, StatusBadge } from './StatusBadge'

const WIDTH = 1000
const HEIGHT = 500

/**
 * Equirectangular projection.
 *
 * Chosen over Web Mercator because this map exists to place a handful of pins and pan between
 * them, not to navigate streets: the linear mapping keeps the maths obvious and avoids the polar
 * distortion that makes a world overview look wrong.
 */
const project = (lon: number, lat: number) => ({
  x: ((lon + 180) / 360) * WIDTH,
  y: ((90 - lat) / 180) * HEIGHT,
})

const landPath = (land as number[][][][])
  .map((polygon) =>
    polygon
      .map((ring) => {
        const points = ring.map(([lon, lat]) => {
          const { x, y } = project(lon!, lat!)
          return `${x.toFixed(1)} ${y.toFixed(1)}`
        })
        return `M${points.join('L')}Z`
      })
      .join(''),
  )
  .join('')

interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

const WORLD: Viewport = { x: 0, y: 0, width: WIDTH, height: HEIGHT }

/** A viewport centred on one school, clamped so panning never reveals empty space. */
const focusOn = (lon: number, lat: number, zoom = 22): Viewport => {
  const width = WIDTH / zoom
  const height = HEIGHT / zoom
  const { x, y } = project(lon, lat)
  return {
    x: Math.min(Math.max(x - width / 2, 0), WIDTH - width),
    y: Math.min(Math.max(y - height / 2, 0), HEIGHT - height),
    width,
    height,
  }
}

const useAnimatedViewport = (target: Viewport): Viewport => {
  const [viewport, setViewport] = useState(target)
  const frame = useRef(0)
  const from = useRef(target)
  const start = useRef(0)

  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setViewport(target)
      return
    }
    from.current = viewport
    start.current = 0
    const step = (time: number) => {
      if (!start.current) start.current = time
      const k = Math.min(1, (time - start.current) / 700)
      const eased = 1 - Math.pow(1 - k, 3)
      setViewport({
        x: from.current.x + (target.x - from.current.x) * eased,
        y: from.current.y + (target.y - from.current.y) * eased,
        width: from.current.width + (target.width - from.current.width) * eased,
        height: from.current.height + (target.height - from.current.height) * eased,
      })
      if (k < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
    // The animation should restart only when the destination changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.x, target.y, target.width, target.height])

  return viewport
}

export const SchoolMap = ({ schools }: { schools: School[] }) => {
  const placed = useMemo(() => schools.filter((school) => school.location), [schools])
  const missing = schools.length - placed.length
  const [focus, setFocus] = useState<string | null>(null)

  useEffect(() => {
    if (focus && !placed.some((school) => school.slug === focus)) setFocus(null)
  }, [focus, placed])

  const active = placed.find((school) => school.slug === focus) ?? null
  const target = active?.location
    ? focusOn(active.location.lon, active.location.lat)
    : placed.length === 1 && placed[0]?.location
      ? focusOn(placed[0].location.lon, placed[0].location.lat, 4)
      : WORLD
  const viewport = useAnimatedViewport(target)

  return (
    <section
      aria-label="School map"
      className="card-edge relative isolate overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div>
          <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Where the directories are
          </p>
          <p className="font-display m-0 mt-1 text-[1.05rem] font-bold">
            {active ? displayName(active) : `${placed.length} mapped ${placed.length === 1 ? 'school' : 'schools'}`}
          </p>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[0.72rem] font-semibold transition hover:border-[var(--line-strong)]"
          >
            Reset view
          </button>
        )}
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
          className="h-[clamp(230px,42svh,420px)] w-full"
          role="img"
          aria-label={`Map showing ${placed.length} school locations`}
        >
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="var(--surface-2)" />
          {Array.from({ length: 11 }, (_, index) => (
            <line
              key={`lat-${index}`}
              x1="0"
              x2={WIDTH}
              y1={(index * HEIGHT) / 10}
              y2={(index * HEIGHT) / 10}
              stroke="var(--grid)"
              strokeWidth={viewport.width / WIDTH}
            />
          ))}
          {Array.from({ length: 13 }, (_, index) => (
            <line
              key={`lon-${index}`}
              y1="0"
              y2={HEIGHT}
              x1={(index * WIDTH) / 12}
              x2={(index * WIDTH) / 12}
              stroke="var(--grid)"
              strokeWidth={viewport.width / WIDTH}
            />
          ))}
          <path d={landPath} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={viewport.width / WIDTH} />

          {placed.map((school) => {
            const { x, y } = project(school.location!.lon, school.location!.lat)
            const selected = school.slug === active?.slug
            const scale = viewport.width / WIDTH
            return (
              <g key={school.slug} transform={`translate(${x} ${y})`}>
                <circle
                  r={(selected ? 9 : 6) * scale}
                  fill="var(--accent)"
                  fillOpacity={selected ? 0.28 : 0.16}
                  className="transition-all duration-300"
                />
                <circle r={3 * scale} fill="var(--accent)" />
              </g>
            )
          })}
        </svg>

        {/* Labels sit above the SVG so they stay legible at every zoom level. */}
        <div className="pointer-events-none absolute inset-0">
          {placed.map((school) => {
            const { x, y } = project(school.location!.lon, school.location!.lat)
            const left = ((x - viewport.x) / viewport.width) * 100
            const top = ((y - viewport.y) / viewport.height) * 100
            if (left < -10 || left > 110 || top < -10 || top > 110) return null
            const selected = school.slug === active?.slug
            return (
              <button
                key={school.slug}
                type="button"
                onClick={() => setFocus(selected ? null : school.slug)}
                aria-pressed={selected}
                style={{ left: `${left}%`, top: `${top}%` }}
                className={`pointer-events-auto absolute z-10 max-w-[46%] -translate-x-1/2 translate-y-2 cursor-pointer truncate rounded-lg border px-2 py-1 text-[0.7rem] font-semibold shadow-lg backdrop-blur transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  selected
                    ? 'border-[var(--line-strong)] bg-[var(--surface-2)]'
                    : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]'
                }`}
              >
                {displayName(school)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        {active ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="truncate text-[0.78rem] text-[var(--text-faint)]">{active.host}</span>
            {active.demo && <DemoBadge />}
            <StatusBadge status={active.status} />
            <span className="text-[0.8rem] text-[var(--text-muted)]">{active.clubCount ?? 0} clubs</span>
          </div>
        ) : (
          <p className="m-0 text-[0.8rem] text-[var(--text-muted)]">
            Select a pin to zoom to a school.
          </p>
        )}
        {missing > 0 && (
          <p className="m-0 text-[0.75rem] text-[var(--text-faint)]">
            {missing} school{missing === 1 ? '' : 's'} without a confirmed location
          </p>
        )}
      </div>
    </section>
  )
}
