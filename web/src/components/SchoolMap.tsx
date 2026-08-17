import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import type { Feature, MultiPolygon } from 'geojson'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import land from '../data/land.json'
import { displayName } from '../filters'
import type { School } from '../types'
import { DemoBadge, StatusBadge } from './StatusBadge'

const WIDTH = 1200
const HEIGHT = 650
const GLOBE_X = WIDTH / 2
const GLOBE_Y = 365
const BASE_SCALE = 345
const MIN_ZOOM = 0.75
const MAX_ZOOM = 3
/** Constant angular speed makes a camera move read as a turning globe, not a timed slide. */
const ROTATION_DEGREES_PER_SECOND = 28
const MIN_ROTATION_MS = 500
const MAX_ROTATION_MS = 5_500

const landFeature: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'MultiPolygon', coordinates: land as number[][][][] },
}

export interface Camera {
  lon: number
  lat: number
  zoom: number
}

export const rotationDurationMs = (from: Camera, target: Camera): number => {
  const angle = geoDistance([from.lon, from.lat], [target.lon, target.lat]) * (180 / Math.PI)
  return Math.max(
    MIN_ROTATION_MS,
    Math.min(MAX_ROTATION_MS, (angle / ROTATION_DEGREES_PER_SECOND) * 1000),
  )
}

/** One frame of a true spherical camera rotation, exported so the geometry is regression-tested. */
export const sphericalCameraAt = (from: Camera, target: Camera, progress: number): Camera => {
  const eased = progress * progress * (3 - 2 * progress)
  const [lon, lat] = geoInterpolate([from.lon, from.lat], [target.lon, target.lat])(eased)
  return { lon, lat, zoom: from.zoom }
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

const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat))
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/**
 * The camera the globe is drawn from.
 *
 * It has two owners and the human is the senior one: an animated fly-to when a school is chosen,
 * and direct control while a pointer or key is driving it. `hold` exists so a drag is not fighting
 * a tween for the same value -- an animation that keeps re-centring under someone's finger feels
 * broken, however smooth it is.
 *
 * This rotation is spatial navigation, not decorative motion: skipping it makes a school jump
 * from one side of the planet to another with no continuity. The camera therefore still turns
 * under reduced-motion; pulses, reveals and other decoration remain disabled by CSS.
 */
const useCamera = (target: Camera, hold: boolean) => {
  const [camera, setCamera] = useState(target)
  const current = useRef(target)
  const frame = useRef(0)

  const set = (next: Camera) => {
    // A single non-finite value would project every coordinate to NaN and blank the globe, so
    // an unusable camera is refused rather than rendered.
    if (!Number.isFinite(next.lon) || !Number.isFinite(next.lat) || !Number.isFinite(next.zoom)) {
      return
    }
    const safe = { ...next, lat: clampLat(next.lat), lon: wrapLon(next.lon) }
    current.current = safe
    setCamera(safe)
  }

  useEffect(() => {
    if (hold) return
    const from = current.current
    // `geoInterpolate` follows the shortest great-circle arc on a sphere. Interpolating lon/lat
    // independently is a flat-map slide and produces the wrong path near the date line and poles.
    const duration = rotationDurationMs(from, target)
    let started = 0
    const step = (time: number) => {
      if (!started) started = time
      const progress = Math.min(1, (time - started) / duration)
      // Nearly constant angular velocity with a short ease at either end. Distance determines
      // duration, so crossing an ocean visibly takes longer than correcting a small nudge.
      set(sphericalCameraAt(from, target, progress))
      if (progress < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [hold, target.lat, target.lon, target.zoom])

  return { camera, current, set }
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
  // Start on a real school when there is one; a demo is useful context, not the default claim.
  const first = located.find((school) => !school.demo) ?? located[0] ?? null
  const [focus, setFocus] = useState<string | null>(first?.slug ?? null)
  const [paused, setPaused] = useState(false)
  const [cycle, setCycle] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Free mode: the human has rotated the globe by hand, so there is no fly-to target and the
  // camera stays exactly where they left it. Only choosing a school or resuming the tour ends it.
  const [free, setFree] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const spin = useRef<{ lon: number; lat: number }>({ lon: 0, lat: 0 })
  const inertia = useRef(0)
  const swallowClick = useRef(false)
  const active = located.find((school) => school.slug === focus) ?? null
  const idle = useRef(0)
  const svg = useRef<SVGSVGElement>(null)
  const surface = useRef<HTMLElement>(null)

  // After a few seconds of no input the globe returns to its tour on its own, so a page left
  // open keeps moving rather than freezing wherever it was last nudged. Every interaction
  // restarts this countdown; leaving for a school never schedules one.
  const resumeTour = () => {
    window.clearTimeout(idle.current)
    if (located.length < 2) return
    idle.current = window.setTimeout(() => {
      setFree(false)
      setFocus(first?.slug ?? null)
      setPaused(false)
      setCycle((value) => value + 1)
    }, 3000)
  }

  useEffect(
    () => () => {
      window.clearTimeout(idle.current)
      cancelAnimationFrame(inertia.current)
    },
    [],
  )

  useEffect(() => {
    if (focus && !located.some((school) => school.slug === focus)) setFocus(null)
  }, [focus, located])

  // Rotate the globe between schools so it remains a live map rather than a static screenshot.
  // Any hover, touch or keyboard focus pauses it immediately; the user always outranks autoplay.
  useEffect(() => {
    if (paused || located.length < 2) return
    const timer = window.setInterval(() => {
      setFocus((current) => {
        const index = located.findIndex((school) => school.slug === current)
        return located[(index + 1) % located.length]?.slug ?? null
      })
      setCycle((value) => value + 1)
    }, 5200)
    return () => window.clearInterval(timer)
  }, [located, paused])

  const target: Camera = active?.location
    ? { lon: active.location.lon, lat: active.location.lat, zoom: 1.55 }
    : overview
  // While dragging or free, the tween is suspended entirely: without this, releasing a drag
  // snapped the camera back to the mean of the schools -- which for schools on opposite sides
  // of the planet is the empty hemisphere between them.
  const { camera, current, set } = useCamera(target, dragging || free)

  /**
   * Dragging rotates the sphere directly.
   *
   * Degrees per pixel is divided by zoom so a zoomed-in globe does not fly out from under the
   * pointer, and Pointer Events cover mouse, touch and pen with one path -- a separate touch
   * implementation is how one of the two silently rots.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    cancelAnimationFrame(inertia.current)
    // A previous gesture may have ended without a click (cancel, drag released outside the
    // window). Clear it now or that stale marker would eat the next tap on a school pin.
    swallowClick.current = false
    window.clearTimeout(idle.current)
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    spin.current = { lon: 0, lat: 0 }
    setPaused(true)
    setDragging(true)
    // Do not capture here. Capturing on every press steals the click from links laid over the
    // globe, so a tap that should open a school stays on this section instead of navigating.
    // Capture starts only once the pointer is demonstrably dragging.
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    const perPixel = 0.32 / camera.zoom
    // Grab-the-globe, not move-the-camera: dragging right must carry the surface right, which
    // means rotating the projection the opposite way. Getting this backwards is the difference
    // between holding a globe and fighting one.
    const dx = -(event.clientX - state.x) * perPixel
    const dy = (event.clientY - state.y) * perPixel
    if (!state.moved && Math.abs(event.clientX - state.x) + Math.abs(event.clientY - state.y) > 3) {
      state.moved = true
      // From this point on it is a drag: keep receiving events even if the pointer leaves the
      // globe. A tap never reaches this line, so links above the globe stay clickable.
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    state.x = event.clientX
    state.y = event.clientY
    spin.current = { lon: dx, lat: dy }
    set({ ...current.current, lon: current.current.lon + dx, lat: current.current.lat + dy })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    // A drag that ends on a label must not also count as tapping that label.
    swallowClick.current = state.moved
    // Releasing mid-flick keeps a little momentum, then stops. Without decay the globe either
    // stops dead or never stops, and both read as a bug.
    if (state.moved) {
      setFocus(null)
      setFree(true)
      let velocity = spin.current
      const glide = () => {
        velocity = { lon: velocity.lon * 0.94, lat: velocity.lat * 0.94 }
        if (Math.abs(velocity.lon) + Math.abs(velocity.lat) < 0.02) return
        set({
          ...current.current,
          lon: current.current.lon + velocity.lon,
          lat: current.current.lat + velocity.lat,
        })
        inertia.current = requestAnimationFrame(glide)
      }
      inertia.current = requestAnimationFrame(glide)
    }
    // Whether or not it moved, the globe returns to its tour a few seconds after release.
    resumeTour()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 6 / camera.zoom
    // Same sense as a drag: ArrowRight pushes the globe to the right.
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setPaused(true)
    setFocus(null)
    setFree(true)
    set({ ...current.current, lon: current.current.lon + move[0], lat: current.current.lat + move[1] })
    resumeTour()
  }

  /**
   * Zoom with the point under the pointer held still.
   *
   * A map that zooms away from the thing the visitor is looking at feels broken. The projection
   * is inverted under the cursor, that point becomes the new camera centre, and the scale is
   * clamped so the earth can neither vanish nor fill the screen past recognition.
   */
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor))
    if (next === camera.zoom) return

    let lon = current.current.lon
    let lat = current.current.lat
    if (clientX !== undefined && clientY !== undefined && svg.current) {
      const rect = svg.current.getBoundingClientRect()
      const scale = rect.width / WIDTH
      const x = (clientX - rect.left) / scale
      const y = (clientY - rect.top) / scale
      const geo = projection.invert?.([x, y])
      if (geo) {
        lon = geo[0]
        lat = geo[1]
      }
    }

    set({ lon, lat, zoom: next })
    setFree(true)
    setPaused(true)
    resumeTour()
  }

  // React's synthetic wheel listener is passive, so a native non-passive listener is the only
  // way to stop the browser scrolling the page while someone zooms the globe.
  const zoomRef = useRef<(factor: number, clientX?: number, clientY?: number) => void>(() => {})
  zoomRef.current = zoomBy
  useEffect(() => {
    const element = surface.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomRef.current(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const onDoubleClick = (event: React.MouseEvent) => {
    zoomBy(1.6, event.clientX, event.clientY)
  }

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
      ref={surface}
      aria-label="School map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onClickCapture={(event) => {
        // The gesture already did something; do not let the same finger also press what it
        // happened to land on.
        if (!swallowClick.current) return
        swallowClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
      }}
      className={`relative isolate h-[clamp(500px,72svh,760px)] w-full touch-none select-none overflow-hidden bg-[var(--canvas)] ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
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
        <div className="mt-3 h-0.5 w-28 overflow-hidden rounded-full bg-[var(--line)]">
          <span
            key={`${active?.slug ?? 'all'}-${cycle}`}
            className={`block h-full origin-left bg-linear-90 from-[var(--accent)] to-[var(--accent-2)] ${
              paused ? 'scale-x-0' : 'animate-[map-cycle_5.2s_linear_forwards]'
            }`}
          />
        </div>
      </div>

      {/* The drag surface owns the sphere. It is a real focusable control with arrow keys, so
          rotation is not mouse-only, and touch-action:none stops a phone scrolling the page
          while someone is spinning the earth. */}
      <div
        role="application"
        tabIndex={0}
        aria-label={`Rotatable globe showing ${located.length} school locations. Use the arrow keys to rotate.`}
        onKeyDown={onKeyDown}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
      <svg
        ref={svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
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
          data-zoom={camera.zoom.toFixed(3)}
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
      </div>

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
            <a
              key={school.slug}
              href={school.siteUrl}
              rel="noopener noreferrer"
              aria-current={selected ? 'true' : undefined}
              aria-label={`Open ${displayName(school)} at ${school.host}`}
              style={{ left: `${(point[0] / WIDTH) * 100}%`, top: `${(point[1] / HEIGHT) * 100}%` }}
              className={`pointer-events-auto absolute z-10 flex max-w-[48vw] -translate-x-1/2 translate-y-4 cursor-pointer items-center gap-1.5 truncate rounded-xl border px-3 py-1.5 text-[0.75rem] font-bold no-underline shadow-xl backdrop-blur-md transition duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                selected
                  ? 'scale-105 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]'
                  : 'border-[var(--line)] bg-[var(--surface)] hover:scale-105 hover:border-[var(--line-strong)]'
              }`}
            >
              <span className="truncate">{displayName(school)}</span>
              <span aria-hidden className="opacity-60">&#8599;</span>
            </a>
          )
        })}
      </div>

      <div className="absolute right-[clamp(0.75rem,2vw,1.5rem)] top-1/2 z-20 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--header-bg)] shadow-xl backdrop-blur-xl">
        <button
          type="button"
          onClick={() => zoomBy(1.35)}
          disabled={camera.zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          className="grid h-10 w-10 cursor-pointer place-items-center text-lg font-semibold transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span aria-hidden>+</span>
        </button>
        <span aria-hidden className="h-px bg-[var(--line)]" />
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.35)}
          disabled={camera.zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          className="grid h-10 w-10 cursor-pointer place-items-center text-lg font-semibold transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span aria-hidden>&minus;</span>
        </button>
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
            Drag to explore &middot; tap a school to open its site
          </p>
        )}
        <div className="flex items-center gap-2">
          {missing > 0 && (
            <span className="hidden text-xs text-[var(--text-faint)] sm:inline">
              {missing} school{missing === 1 ? '' : 's'} awaiting a confirmed location
            </span>
          )}
          {(active || paused) && located.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFocus(first?.slug ?? null)
                setPaused(false)
                setFree(false)
                setCycle((value) => value + 1)
              }}
              className="cursor-pointer rounded-full border border-[var(--line)] bg-[var(--header-bg)] px-3 py-1.5 text-xs font-semibold backdrop-blur-xl transition hover:border-[var(--line-strong)]"
            >
              {paused ? 'Resume tour' : 'Restart tour'}
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
