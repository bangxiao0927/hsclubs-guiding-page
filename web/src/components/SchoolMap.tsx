import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import type { Feature, MultiPolygon } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'

import land from '../data/land.json'
import { displayName } from '../filters'
import type { School } from '../types'
import { DemoBadge, StatusBadge } from './StatusBadge'

const WIDTH = 1200
const HEIGHT = 650
const GLOBE_X = WIDTH / 2
const GLOBE_Y = 365
const BASE_SCALE = 345

const landFeature: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'MultiPolygon', coordinates: land as number[][][][] },
}

interface Camera {
  lon: number
  lat: number
  zoom: number
}

const meanCamera = (schools: School[]): Camera => {
  const located = schools.flatMap((school) => (school.location ? [school.location] : []))
  if (located.length === 0) return { lon: -100, lat: 25, zoom: 0.95 }
  return {
    lon: located.reduce((sum, point) => sum + point.lon, 0) / located.length,
    lat: located.reduce((sum, point) => sum + point.lat, 0) / located.length,
    zoom: located.length === 1 ? 1.05 : 0.9,
  }
}

const useCamera = (target: Camera): Camera => {
  const [camera, setCamera] = useState(target)
  const current = useRef(target)
  const frame = useRef(0)

  useEffect(() => {
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      current.current = target
      setCamera(target)
      return
    }

    const from = current.current
    let started = 0
    const step = (time: number) => {
      if (!started) started = time
      const progress = Math.min(1, (time - started) / 900)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = {
        lon: from.lon + (target.lon - from.lon) * eased,
        lat: from.lat + (target.lat - from.lat) * eased,
        zoom: from.zoom + (target.zoom - from.zoom) * eased,
      }
      current.current = next
      setCamera(next)
      if (progress < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [target.lat, target.lon, target.zoom])

  return camera
}

/**
 * A full-bleed orthographic globe: one visible hemisphere, not a flat map in a card.
 *
 * d3-geo is used for its spherical clipping, not for UI. A naive SVG projection joins polygon
 * edges across the back of the earth and draws continents through the globe. Labels stay HTML
 * controls above the SVG so they remain readable while the sphere rotates and scales.
 */
export const SchoolMap = ({ schools }: { schools: School[] }) => {
  const located = useMemo(() => schools.filter((school) => school.location), [schools])
  const missing = schools.length - located.length
  const overview = useMemo(() => meanCamera(located), [located])
  const [focus, setFocus] = useState<string | null>(null)
  const active = located.find((school) => school.slug === focus) ?? null

  useEffect(() => {
    if (focus && !located.some((school) => school.slug === focus)) setFocus(null)
  }, [focus, located])

  const target: Camera = active?.location
    ? { lon: active.location.lon, lat: active.location.lat, zoom: 1.55 }
    : overview
  const camera = useCamera(target)

  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([GLOBE_X, GLOBE_Y])
        .scale(BASE_SCALE * camera.zoom)
        .rotate([-camera.lon, -camera.lat])
        .clipAngle(90)
        .precision(0.2),
    [camera],
  )
  const path = useMemo(() => geoPath(projection), [projection])
  const landPath = path(landFeature) ?? ''
  const gridPath = path(geoGraticule10()) ?? ''

  return (
    <section
      aria-label="School map"
      className="relative isolate h-[clamp(500px,72svh,760px)] w-full overflow-hidden bg-[var(--canvas)]"
    >
      {/* Atmospheric lights are attached to the map, so the globe grows out of the page rather
          than sitting inside another bordered panel. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(circle at 50% 57%, var(--glow-1), transparent 38%), radial-gradient(circle at 72% 20%, var(--glow-2), transparent 30%)',
        }}
        aria-hidden
      />

      <div className="pointer-events-none absolute left-[clamp(1.15rem,4vw,3.5rem)] top-8 z-10">
        <p className="m-0 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
          School network
        </p>
        <h1 className="font-display m-0 mt-1 text-[clamp(1.5rem,3vw,2.5rem)] font-extrabold tracking-[-0.035em]">
          {active ? displayName(active) : 'Find a school directory'}
        </h1>
        <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">
          {located.length} mapped &middot; {schools.length} connected
        </p>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`3D globe showing ${located.length} school locations`}
      >
        <defs>
          <radialGradient id="ocean" cx="38%" cy="28%" r="75%">
            <stop offset="0" stopColor="var(--surface-2)" />
            <stop offset="0.72" stopColor="var(--surface)" />
            <stop offset="1" stopColor="var(--canvas)" />
          </radialGradient>
          <radialGradient id="atmosphere" cx="50%" cy="50%" r="50%">
            <stop offset="76%" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="93%" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.38" />
          </radialGradient>
          <filter id="globe-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="28" stdDeviation="30" floodColor="#000" floodOpacity="0.48" />
          </filter>
        </defs>

        <circle
          cx={GLOBE_X}
          cy={GLOBE_Y}
          r={BASE_SCALE * camera.zoom}
          fill="url(#ocean)"
          filter="url(#globe-shadow)"
        />
        <path
          d={gridPath}
          fill="none"
          stroke="var(--grid)"
          strokeWidth={0.7 / camera.zoom}
        />
        <path
          data-testid="globe-land"
          d={landPath}
          fill="var(--surface-2)"
          stroke="var(--line-strong)"
          strokeWidth={0.65 / camera.zoom}
          strokeLinejoin="round"
        />
        <circle
          cx={GLOBE_X}
          cy={GLOBE_Y}
          r={BASE_SCALE * camera.zoom}
          fill="url(#atmosphere)"
          stroke="var(--line-strong)"
          strokeWidth={1.2}
        />

        {located.map((school) => {
          const point = projection([school.location!.lon, school.location!.lat])
          const visible =
            geoDistance(
              [camera.lon, camera.lat],
              [school.location!.lon, school.location!.lat],
            ) <=
            Math.PI / 2
          if (!point || !visible) return null
          const selected = school.slug === active?.slug
          return (
            <g key={school.slug} transform={`translate(${point[0]} ${point[1]})`}>
              <circle
                r={selected ? 18 : 13}
                fill="var(--accent)"
                fillOpacity={selected ? 0.16 : 0.1}
                className="animate-pulse motion-reduce:animate-none"
              />
              <circle r={selected ? 6 : 5} fill="var(--accent)" stroke="var(--canvas)" strokeWidth="2" />
            </g>
          )
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0">
        {located.map((school) => {
          const point = projection([school.location!.lon, school.location!.lat])
          const visible =
            geoDistance(
              [camera.lon, camera.lat],
              [school.location!.lon, school.location!.lat],
            ) <=
            Math.PI / 2
          if (!point || !visible) return null
          const selected = school.slug === active?.slug
          return (
            <button
              key={school.slug}
              type="button"
              onClick={() => setFocus(selected ? null : school.slug)}
              aria-pressed={selected}
              style={{ left: `${(point[0] / WIDTH) * 100}%`, top: `${(point[1] / HEIGHT) * 100}%` }}
              className={`pointer-events-auto absolute z-10 max-w-[48vw] -translate-x-1/2 translate-y-4 cursor-pointer truncate rounded-xl border px-3 py-1.5 text-[0.75rem] font-bold shadow-xl backdrop-blur-md transition duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                selected
                  ? 'scale-105 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]'
                  : 'border-[var(--line)] bg-[var(--surface)] hover:scale-105 hover:border-[var(--line-strong)]'
              }`}
            >
              {displayName(school)}
            </button>
          )
        })}
      </div>

      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-[clamp(1.15rem,4vw,3.5rem)] right-[clamp(1.15rem,4vw,3.5rem)] z-10 flex flex-wrap items-end justify-between gap-3">
        {active ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--header-bg)] px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
            <span className="text-[var(--text-faint)]">{active.host}</span>
            {active.demo && <DemoBadge />}
            <StatusBadge status={active.status} />
            <span className="text-[var(--text-muted)]">{active.clubCount ?? 0} clubs</span>
          </div>
        ) : (
          <p className="m-0 rounded-full border border-[var(--line)] bg-[var(--header-bg)] px-3 py-1.5 text-xs text-[var(--text-muted)] backdrop-blur-xl">
            Select a school to rotate and focus the globe
          </p>
        )}
        <div className="flex items-center gap-2">
          {missing > 0 && (
            <span className="hidden text-xs text-[var(--text-faint)] sm:inline">
              {missing} school{missing === 1 ? '' : 's'} awaiting a confirmed location
            </span>
          )}
          {active && (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="cursor-pointer rounded-full border border-[var(--line)] bg-[var(--header-bg)] px-3 py-1.5 text-xs font-semibold backdrop-blur-xl transition hover:border-[var(--line-strong)]"
            >
              Show all
            </button>
          )}
          <a
            href="#directories"
            className="rounded-full bg-linear-140 from-[var(--accent)] to-[var(--accent-2)] px-4 py-2 text-xs font-bold text-white shadow-xl transition hover:-translate-y-px"
          >
            Browse directories &darr;
          </a>
        </div>
      </div>
    </section>
  )
}
