import type { PageSchool } from './pageData.js'
import type { SchoolRecord } from './store.js'

/**
 * Renders the page from what the poller stored. No framework and no build step: this is a list
 * of a handful of schools, and every dependency here would be one more thing to keep alive on a
 * machine that is meant to be left alone.
 *
 * The visual language deliberately mirrors a school site (the 1st repo's frontend/src/assets):
 * same tokens, same radii, same card shadow, so arriving here and clicking through to a school
 * feels like one product rather than two. Nothing is imported to achieve that -- no web font, no
 * stylesheet, no script from anywhere -- because this page must render identically on a machine
 * with no outbound access at the moment of the request.
 *
 * Everything rendered came from someone else's server, so everything rendered is escaped.
 */
export interface RenderOptions {
  title?: string
  /** For "updated 3 hours ago" and for deciding what counts as stale. */
  now?: Date
  staleAfterMs?: number
}

const DEFAULT_STALE_AFTER_MS = 26 * 60 * 60 * 1000
/** Enough to characterise a directory; the tail is counted instead (see renderCategories). */
const MAX_CATEGORIES = 6
/** Inline so the page needs no second request, and no request at all when offline. */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Ctext x='16' y='22' font-family='system-ui,sans-serif' font-size='15' font-weight='700' fill='white' text-anchor='middle'%3EHS%3C/text%3E%3C/svg%3E"

export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** Human "3 hours ago", because an ISO instant tells a visitor nothing about freshness. */
export const describeAge = (from: string | null, now: Date): string => {
  if (!from) return 'never'
  const then = Date.parse(from)
  if (Number.isNaN(then)) return 'unknown'

  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000))
  if (seconds < 90) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return plural(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 36) return plural(hours, 'hour')
  return plural(Math.round(hours / 24), 'day')
}

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? '' : 's'} ago`

/** Only the host, so a card shows "hsclubs.net" rather than a full URL nobody reads. */
const hostOf = (siteUrl: string): string => {
  try {
    return new URL(siteUrl).host
  } catch {
    return siteUrl
  }
}

const renderCategories = (categories: Record<string, number>): string => {
  const entries = Object.entries(categories).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return ''
  // A school with forty categories would push its own freshness line off the card and make
  // every other card in the grid a different height. The long tail is the least interesting
  // part of a directory, so it is counted rather than listed.
  const shown = entries.slice(0, MAX_CATEGORIES)
  const hidden = entries.length - shown.length
  const more = hidden > 0 ? `<li class="more">+${escapeHtml(String(hidden))} more</li>` : ''
  return `<ul class="categories">${shown
    .map(
      ([name, count]) =>
        `<li><span>${escapeHtml(name)}</span><b>${escapeHtml(String(count))}</b></li>`,
    )
    .join('')}${more}</ul>`
}

/**
 * Stale means "we have not been able to read this school recently" -- not "this school has not
 * changed recently". A directory that changes weekly is polled hourly and answers 304 almost
 * every time; measuring content age here would brand every healthy school stale and make the
 * one signal that matters useless.
 */
const isStale = (record: SchoolRecord, now: Date, staleAfterMs: number): boolean => {
  if (record.lastError) return true
  const polled = Date.parse(record.lastPolledAt ?? '')
  return Number.isNaN(polled) || now.getTime() - polled > staleAfterMs
}

/**
 * The card itself is the link, so the whole target is clickable and one Tab stop long. That
 * makes this a label rather than a second link -- a link inside a link is not valid HTML and
 * lands a keyboard user on the same destination twice.
 */
const visitLabel = (siteUrl: string): string =>
  `<span class="visit">Open ${escapeHtml(hostOf(siteUrl))} <span aria-hidden="true">&rarr;</span></span>`

const renderSchool = ({ record, siteUrl }: PageSchool, now: Date, staleAfterMs: number): string => {
  const href = escapeHtml(siteUrl)
  const summary = record.summary
  if (!summary) {
    // Listed but never successfully read: say so rather than silently omitting the school, or
    // nobody will ever notice a school that has been broken since the day it was added.
    return `<a class="school unavailable" href="${href}" rel="noopener noreferrer">
      <p class="badge warn">No data</p>
      <h2>${escapeHtml(record.slug)}</h2>
      <p class="note">No data yet. ${escapeHtml(record.lastError ?? 'Never polled.')}</p>
      ${visitLabel(siteUrl)}
    </a>`
  }

  const stale = isStale(record, now, staleAfterMs)
  const note = record.lastError
    ? `<p class="note">Last poll failed: ${escapeHtml(record.lastError)}</p>`
    : ''

  return `<a class="school${stale ? ' stale' : ''}" href="${href}" rel="noopener noreferrer">
      <p class="badge${stale ? ' warn' : ' ok'}">${stale ? 'Stale' : 'Live'}</p>
      <h2>${escapeHtml(summary.schoolName)}</h2>
      ${summary.address ? `<p class="address">${escapeHtml(summary.address)}</p>` : ''}
      <p class="counts"><b>${escapeHtml(String(summary.clubCount))}</b> clubs</p>
      ${renderCategories(summary.categories)}
      <p class="freshness">Updated ${escapeHtml(describeAge(record.lastUpdatedAt, now))}${
        stale ? ' (stale)' : ''
      }</p>
      ${note}
      ${visitLabel(siteUrl)}
    </a>`
}

const statCard = (label: string, value: string): string =>
  `<div class="stat"><p class="stat-label">${escapeHtml(
    label,
  )}</p><p class="stat-value">${escapeHtml(value)}</p></div>`

/**
 * Applied before the first paint, so a stored dark preference never flashes light. Mirrors the
 * school site's own bootstrap (localStorage key `theme`), which is what makes the two feel like
 * one product. It reads nothing a school site supplied, so no escaping question arises.
 */
const THEME_SCRIPT = `(function(){var r=document.documentElement;try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark'){r.dataset.theme=s}}catch(e){}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-theme-toggle]');if(!t)return;var dark=getComputedStyle(r).colorScheme==='dark';var next=dark?'light':'dark';r.dataset.theme=next;try{localStorage.setItem('theme',next)}catch(err){}})})()`

const DARK_TOKENS = `
  color-scheme: dark;
  --mv-border: rgba(125, 211, 252, 0.22);
  --mv-border-strong: rgba(125, 211, 252, 0.42);
  --mv-accent: #7dd3fc;
  --mv-text: #f8fafc;
  --mv-text-muted: #b8c5d6;
  --mv-text-faint: rgba(226, 232, 240, 0.72);
  --app-bg:
    radial-gradient(circle at 15% 15%, rgba(14, 165, 233, 0.22), transparent 42%),
    radial-gradient(circle at 80% 0%, rgba(37, 99, 235, 0.18), transparent 42%),
    linear-gradient(180deg, #0b1628 0%, #07111f 55%, #04090f 100%);
  --mv-header-bg: rgba(7, 17, 31, 0.9);
  --mv-surface-hero: rgba(20, 45, 74, 0.58);
  --mv-surface-card: rgba(15, 23, 42, 0.78);
  --mv-surface-soft: rgba(30, 41, 59, 0.62);
  --mv-surface-muted: rgba(15, 23, 42, 0.58);
  --mv-surface-accent: rgba(125, 211, 252, 0.14);
  --mv-status-success: #bbf7d0;
  --mv-status-warning: #fde68a;
  --mv-shadow-card: 0 25px 40px rgba(0, 0, 0, 0.28);
`

const STYLES = `
:root {
  color-scheme: light;
  --mv-border: rgba(37, 99, 235, 0.16);
  --mv-border-strong: rgba(37, 99, 235, 0.28);
  --mv-accent: #2563eb;
  --mv-text: #0f172a;
  --mv-text-muted: #475569;
  --mv-text-faint: rgba(71, 85, 105, 0.8);
  --app-bg:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 32%),
    radial-gradient(circle at 85% 12%, rgba(14, 165, 233, 0.14), transparent 30%),
    linear-gradient(180deg, #f8fbff 0%, #eef5ff 58%, #e7effc 100%);
  --mv-header-bg: rgba(248, 251, 255, 0.86);
  --mv-surface-hero: rgba(219, 234, 254, 0.55);
  --mv-surface-card: rgba(255, 255, 255, 0.86);
  --mv-surface-soft: rgba(226, 239, 255, 0.72);
  --mv-surface-muted: rgba(239, 246, 255, 0.74);
  --mv-surface-accent: rgba(37, 99, 235, 0.1);
  --mv-status-success: #15803d;
  --mv-status-warning: #b45309;
  --mv-shadow-card: 0 18px 40px rgba(37, 99, 235, 0.12);
  --page-width: min(1100px, 100%);
  --page-padding: clamp(1rem, 3vw + 0.5rem, 3rem);
}
:root[data-theme='dark'] {${DARK_TOKENS}}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {${DARK_TOKENS}}
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--app-bg) fixed;
  color: var(--mv-text);
  font-family: 'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', sans-serif;
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--mv-header-bg);
  border-bottom: 1px solid var(--mv-border);
  backdrop-filter: blur(12px);
}
.header-inner,
.shell {
  width: var(--page-width);
  margin: 0 auto;
  padding-inline: var(--page-padding);
}
.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 0.9rem;
}
.logo { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; letter-spacing: -0.01em; }
.logo-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--mv-surface-accent);
  border: 1px solid var(--mv-border-strong);
  color: var(--mv-accent);
  font-size: 0.9rem;
}
.theme-toggle {
  border: 1px solid var(--mv-border-strong);
  background: var(--mv-surface-card);
  color: inherit;
  border-radius: 999px;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
}
.theme-toggle:hover { border-color: var(--mv-accent); }
main { padding-block: clamp(1.5rem, 4vw, 3rem) clamp(2rem, 5vw, 3.5rem); }
.hero {
  border: 1px solid var(--mv-border);
  border-radius: 36px;
  background: var(--mv-surface-hero);
  box-shadow: var(--mv-shadow-card);
  padding: clamp(1.5rem, 4vw, 2.75rem);
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  justify-content: space-between;
}
.hero-copy { max-width: 34rem; display: flex; flex-direction: column; gap: 0.85rem; }
.label {
  align-self: flex-start;
  padding: 0.2rem 0.85rem;
  border-radius: 999px;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid var(--mv-border-strong);
  background: var(--mv-surface-accent);
  color: var(--mv-accent);
}
.hero h1 { margin: 0; font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; letter-spacing: -0.02em; }
.hero p { margin: 0; color: var(--mv-text-muted); }
.stats { display: flex; flex-wrap: wrap; gap: 0.85rem; align-content: flex-start; }
.stat {
  min-width: 150px;
  border: 1px solid var(--mv-border);
  border-radius: 20px;
  background: var(--mv-surface-soft);
  padding: 1rem 1.25rem;
}
.stat-label { margin: 0; font-size: 0.9rem; color: var(--mv-text-faint); }
.stat-value { margin: 0.2rem 0 0; font-size: 1.75rem; font-weight: 700; color: var(--mv-accent); }
.schools {
  margin-top: clamp(1.5rem, 4vw, 2.5rem);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.25rem;
}
/* One school must not be stretched across the full width, nor squeezed into a third of it. */
.schools.single { grid-template-columns: minmax(0, 34rem); }
.school {
  position: relative;
  border: 1px solid var(--mv-border);
  border-radius: 24px;
  background: var(--mv-surface-card);
  box-shadow: var(--mv-shadow-card);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.school:hover, .school:focus-visible { border-color: var(--mv-border-strong); transform: translateY(-2px); }
.school:focus-visible { outline: 2px solid var(--mv-accent); outline-offset: 3px; }
.school:hover .visit, .school:focus-visible .visit { text-decoration: underline; }
.school:hover h2 { color: var(--mv-accent); }
.school.stale, .school.unavailable { border-style: dashed; background: var(--mv-surface-muted); }
.school h2 { margin: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; transition: color 0.2s ease; }
.badge {
  align-self: flex-start;
  margin: 0;
  padding: 0.1rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid var(--mv-border-strong);
  background: var(--mv-surface-accent);
}
.badge::before {
  content: '';
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  margin-right: 0.4rem;
  vertical-align: 0.05rem;
  background: currentColor;
}
.badge.ok { color: var(--mv-status-success); }
.badge.warn { color: var(--mv-status-warning); }
.address { margin: 0; color: var(--mv-text-muted); font-size: 0.92rem; }
.counts { margin: 0; color: var(--mv-text-muted); }
.counts b { font-size: 1.9rem; font-weight: 700; color: var(--mv-accent); margin-right: 0.35rem; }
.categories { display: flex; flex-wrap: wrap; gap: 0.4rem; list-style: none; padding: 0; margin: 0; }
.categories li {
  border: 1px solid var(--mv-border);
  background: var(--mv-surface-soft);
  border-radius: 999px;
  padding: 0.1rem 0.7rem;
  font-size: 0.82rem;
}
.categories b { margin-left: 0.35rem; color: var(--mv-accent); }
.categories .more { color: var(--mv-text-faint); background: transparent; border-style: dashed; }
.freshness, .note { margin: 0; font-size: 0.85rem; color: var(--mv-text-faint); }
.note { color: var(--mv-status-warning); }
.visit {
  margin-top: auto;
  padding-top: 0.35rem;
  color: var(--mv-accent);
  font-weight: 600;
  font-size: 0.92rem;
}
.empty {
  border: 1px dashed var(--mv-border-strong);
  border-radius: 24px;
  background: var(--mv-surface-muted);
  color: var(--mv-text-muted);
  padding: 1.25rem 1.5rem;
  margin-top: 1.5rem;
}
.footer {
  margin-top: clamp(2rem, 5vw, 3rem);
  padding-top: 1.25rem;
  border-top: 1px solid var(--mv-border);
  color: var(--mv-text-faint);
  font-size: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  justify-content: space-between;
}
@media (max-width: 720px) {
  .hero { border-radius: 24px; }
  .stats { width: 100%; }
  .stat { flex: 1 1 140px; }
  .schools.single { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .school, .school h2 { transition: none; }
  .school:hover, .school:focus-visible { transform: none; }
}
`

export const renderPage = (schools: PageSchool[], options: RenderOptions = {}): string => {
  const now = options.now ?? new Date()
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS
  const title = options.title ?? 'HS Clubs'

  const sorted = [...schools].sort((a, b) => {
    const nameA = a.record.summary?.schoolName ?? a.record.slug
    const nameB = b.record.summary?.schoolName ?? b.record.slug
    return nameA.localeCompare(nameB)
  })

  const clubs = sorted.reduce((total, { record }) => total + (record.summary?.clubCount ?? 0), 0)
  // The freshest successful read, because a visitor asking "is this page alive?" is asking about
  // the poller, not about any one school.
  const polled = sorted
    .map(({ record }) => Date.parse(record.lastPolledAt ?? ''))
    .filter((value) => !Number.isNaN(value))
  const lastPolled = polled.length > 0 ? new Date(Math.max(...polled)).toISOString() : null

  const body =
    sorted.length === 0
      ? '<p class="empty">No schools yet. Verify a school and it appears here.</p>'
      : `<section class="schools${sorted.length === 1 ? ' single' : ''}">${sorted
          .map((school) => renderSchool(school, now, staleAfterMs))
          .join('\n')}</section>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Club directories from the schools that publish one, each linked to the school's own site.">
<link rel="icon" href="${FAVICON}">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<header class="header">
  <div class="header-inner">
    <div class="logo"><span class="logo-mark" aria-hidden="true">HS</span>${escapeHtml(title)}</div>
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch light or dark theme">
      <span aria-hidden="true">&#9681;</span>
    </button>
  </div>
</header>
<main class="shell">
  <section class="hero">
    <div class="hero-copy">
      <span class="label">Club directories</span>
      <h1>${escapeHtml(title)}</h1>
      <p>Every school below runs its own club directory. This page reads each site&#39;s public
      summary and points you at the real thing -- it never holds a club, a member or a login.</p>
    </div>
    <div class="stats">
      ${statCard('Schools', String(sorted.length))}
      ${statCard('Clubs listed', String(clubs))}
      ${statCard('Last checked', describeAge(lastPolled, now))}
    </div>
  </section>
  ${body}
  <footer class="footer">
    <span>Pulled from each school&#39;s public summary. Nothing is ever written back.</span>
    <span>Generated ${escapeHtml(now.toISOString())}</span>
  </footer>
</main>
</body>
</html>
`
}
