import type { PageSchool } from './pageData.js'
import type { SchoolRecord } from './store.js'

/**
 * Renders the page from what the poller stored. No framework and no build step: this is a list
 * of a handful of schools, and every dependency here would be one more thing to keep alive on a
 * machine that is meant to be left alone.
 *
 * The visual language deliberately mirrors a school site (the 1st repo's frontend/src/assets):
 * same palette, same card shadow, same type scale, so arriving here and clicking through to a
 * school feels like one product rather than two. Nothing is imported to achieve that -- no web
 * font, no stylesheet, no script from anywhere -- because this page must render identically on
 * a machine with no outbound access at the moment of the request.
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

const renderSchool = ({ record, siteUrl }: PageSchool, now: Date, staleAfterMs: number): string => {
  const href = escapeHtml(siteUrl)
  const host = escapeHtml(hostOf(siteUrl))
  const summary = record.summary
  // The card itself is the link, so the whole target is clickable and one Tab stop long. A
  // second link inside it would not be valid HTML and would land a keyboard user on the same
  // destination twice.
  if (!summary) {
    // Listed but never successfully read: say so rather than silently omitting the school, or
    // nobody will ever notice a school that has been broken since the day it was added.
    return `<a class="school unavailable" href="${href}" rel="noopener noreferrer" data-reveal>
      <span class="school-top"><span class="host">${host}</span><span class="badge warn">No data</span></span>
      <h3>${escapeHtml(record.slug)}</h3>
      <p class="note">No data yet. ${escapeHtml(record.lastError ?? 'Never polled.')}</p>
      <span class="school-foot"><span class="visit">Open site <span aria-hidden="true">&rarr;</span></span></span>
    </a>`
  }

  const stale = isStale(record, now, staleAfterMs)
  const note = record.lastError
    ? `<p class="note">Last poll failed: ${escapeHtml(record.lastError)}</p>`
    : ''

  return `<a class="school${stale ? ' stale' : ''}" href="${href}" rel="noopener noreferrer" data-reveal>
      <span class="school-top"><span class="host">${host}</span><span class="badge${
        stale ? ' warn' : ' ok'
      }">${stale ? 'Stale' : 'Live'}</span></span>
      <h3>${escapeHtml(summary.schoolName)}</h3>
      ${summary.address ? `<p class="address">${escapeHtml(summary.address)}</p>` : ''}
      <p class="counts"><b>${escapeHtml(String(summary.clubCount))}</b> clubs</p>
      ${renderCategories(summary.categories)}
      ${note}
      <span class="school-foot">
        <span class="freshness">Updated ${escapeHtml(describeAge(record.lastUpdatedAt, now))}${
          stale ? ' (stale)' : ''
        }</span>
        <span class="visit">Open site <span aria-hidden="true">&rarr;</span></span>
      </span>
    </a>`
}

/** `wide` is for a value that is a phrase rather than a number: "10 minutes ago" set at the
 *  numeral size drags the row out of alignment and reads as the most important fact on it. */
const statCard = (label: string, value: string, wide = false): string =>
  `<div class="stat${wide ? ' wide' : ''}"><p class="stat-value">${escapeHtml(
    value,
  )}</p><p class="stat-label">${escapeHtml(label)}</p></div>`

/**
 * Two jobs, both of which have to degrade to nothing: apply a stored theme before the first
 * paint (mirroring the school site's own bootstrap and its `theme` key), and reveal sections as
 * they scroll in. Two things keep the reveal from ever becoming a way to hide the page: the
 * styles are scoped to a `js` class this script sets, so scripting off means nothing is hidden
 * in the first place, and a timer shows everything after 1.2s regardless -- an observer that
 * never fires (a background tab, a browser that throttles it, a layout that never intersects)
 * must cost an animation, not the content.
 */
const PAGE_SCRIPT = `(function(){var r=document.documentElement;try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark'){r.dataset.theme=s}}catch(e){}
r.className+=' js';
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-theme-toggle]');if(!t)return;var dark=getComputedStyle(r).colorScheme==='dark';var next=dark?'light':'dark';r.dataset.theme=next;try{localStorage.setItem('theme',next)}catch(err){}});
document.addEventListener('DOMContentLoaded',function(){var els=[].slice.call(document.querySelectorAll('[data-reveal]'));if(!window.IntersectionObserver){els.forEach(function(el){el.classList.add('in')});return}
var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('in');io.unobserve(entry.target)}})},{rootMargin:'0px 0px -8% 0px'});
els.forEach(function(el,i){el.style.setProperty('--delay',(i%6)*60+'ms');io.observe(el)});setTimeout(function(){els.forEach(function(el){el.classList.add('in')})},1200)})})()`

const DARK_TOKENS = `
  color-scheme: dark;
  --line: rgba(148, 180, 214, 0.16);
  --line-strong: rgba(125, 211, 252, 0.34);
  --accent: #7dd3fc;
  --accent-contrast: #082f49;
  --text: #f8fafc;
  --text-muted: #aab8c9;
  --text-faint: rgba(226, 232, 240, 0.62);
  --page-bg:
    radial-gradient(1200px 600px at 12% -8%, rgba(14, 165, 233, 0.16), transparent 60%),
    radial-gradient(900px 500px at 88% 4%, rgba(37, 99, 235, 0.14), transparent 55%),
    linear-gradient(180deg, #0b1628 0%, #07111f 55%, #050c15 100%);
  --header-bg: rgba(7, 17, 31, 0.72);
  --surface: rgba(15, 23, 42, 0.72);
  --surface-strong: rgba(17, 27, 48, 0.86);
  --surface-soft: rgba(30, 41, 59, 0.5);
  --surface-accent: rgba(125, 211, 252, 0.12);
  --status-ok: #6ee7b7;
  --status-warn: #fcd34d;
  --shadow: 0 24px 60px rgba(2, 8, 20, 0.5);
`

const STYLES = `
:root {
  color-scheme: light;
  --line: rgba(15, 23, 42, 0.1);
  --line-strong: rgba(37, 99, 235, 0.26);
  --accent: #2563eb;
  --accent-contrast: #ffffff;
  --text: #0b1220;
  --text-muted: #4a5568;
  --text-faint: rgba(71, 85, 105, 0.78);
  --page-bg:
    radial-gradient(1200px 600px at 12% -8%, rgba(59, 130, 246, 0.14), transparent 60%),
    radial-gradient(900px 500px at 88% 4%, rgba(14, 165, 233, 0.12), transparent 55%),
    linear-gradient(180deg, #ffffff 0%, #f6f9ff 55%, #eef4fd 100%);
  --header-bg: rgba(255, 255, 255, 0.72);
  --surface: rgba(255, 255, 255, 0.9);
  --surface-strong: #ffffff;
  --surface-soft: rgba(240, 245, 255, 0.8);
  --surface-accent: rgba(37, 99, 235, 0.08);
  --status-ok: #047857;
  --status-warn: #b45309;
  --shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
  --page-width: min(1180px, 100%);
  --page-padding: clamp(1.15rem, 4vw, 3.5rem);
  --header-height: 68px;
}
:root[data-theme='dark'] {${DARK_TOKENS}}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {${DARK_TOKENS}}
}
* { box-sizing: border-box; }
/* The gradient is painted once, fixed, on body; the canvas underneath still needs a colour or
   an overscroll past the end of the document flashes the browser default -- black in dark mode. */
html { scroll-behavior: smooth; background-color: #f6f9ff; }
:root[data-theme='dark'] { background-color: #07111f; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { background-color: #07111f; }
}
body {
  margin: 0;
  min-height: 100vh;
  background: var(--page-bg) fixed;
  color: var(--text);
  font-family: 'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', sans-serif;
  font-size: 15.5px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.shell { width: var(--page-width); margin: 0 auto; padding-inline: var(--page-padding); }

.header {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--header-height);
  display: flex;
  align-items: center;
  background: var(--header-bg);
  border-bottom: 1px solid var(--line);
  backdrop-filter: saturate(180%) blur(14px);
}
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%; }
.logo { display: flex; align-items: center; gap: 0.65rem; font-weight: 700; letter-spacing: -0.015em; }
.logo-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.header-right { display: flex; align-items: center; gap: 0.5rem; }
.header-link {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
}
.header-link:hover { color: var(--text); background: var(--surface-accent); }
.theme-toggle {
  border: 1px solid var(--line);
  background: var(--surface);
  color: inherit;
  border-radius: 10px;
  width: 34px;
  height: 34px;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
}
.theme-toggle:hover { border-color: var(--line-strong); }

/* The first screen is the proposition; the list is one scroll away, which is also why the
   header keeps a link straight to it for anyone who does not want the trip. */
.hero { min-height: calc(100svh - var(--header-height)); display: grid; align-items: center; }
.hero-inner { padding-block: clamp(3rem, 9vh, 6rem); }
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
.eyebrow::before {
  content: '';
  width: 1.6rem;
  height: 1px;
  background: currentColor;
  opacity: 0.6;
}
h1 {
  margin: 1.1rem 0 0;
  font-size: clamp(2.4rem, 6vw, 4.25rem);
  line-height: 1.04;
  font-weight: 700;
  letter-spacing: -0.035em;
  max-width: 18ch;
}
.lead {
  margin: 1.1rem 0 0;
  max-width: 54ch;
  font-size: clamp(1rem, 1.6vw, 1.15rem);
  color: var(--text-muted);
}
.stats {
  margin-top: clamp(2.25rem, 6vh, 3.5rem);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, max-content));
  gap: clamp(1.5rem, 5vw, 4rem);
  /* The last figure is a phrase set smaller than the numerals; align on the labels so the row
     still reads as one line rather than three of slightly different heights. */
  align-items: end;
  border-top: 1px solid var(--line);
  padding-top: 1.5rem;
}
.stat-value {
  margin: 0;
  font-size: clamp(1.7rem, 3.4vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.stat.wide .stat-value { font-size: clamp(1.15rem, 2vw, 1.6rem); letter-spacing: -0.02em; }
.stat-label {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.cue {
  margin-top: clamp(2rem, 6vh, 3.25rem);
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 600;
}
.cue .arrow {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  animation: nudge 2.4s ease-in-out infinite;
}
.cue:hover { color: var(--accent); }
@keyframes nudge {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}

.directories { padding-block: clamp(3rem, 8vh, 5rem) clamp(3rem, 8vh, 5rem); scroll-margin-top: var(--header-height); }
.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--line);
}
.section-head h2 { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
.section-note { margin: 0; color: var(--text-faint); font-size: 0.9rem; }

.schools {
  margin-top: 1.75rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.1rem;
}
.schools.single { grid-template-columns: minmax(0, 36rem); }
.school {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1.6rem;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}
.school:hover, .school:focus-visible {
  border-color: var(--line-strong);
  transform: translateY(-3px);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.12);
}
.school:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.school.stale, .school.unavailable { background: var(--surface-soft); }
.school-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.host { font-size: 0.82rem; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.school h3 { margin: 0; font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em; transition: color 0.2s ease; }
.school:hover h3 { color: var(--accent); }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.badge::before { content: ''; width: 0.45rem; height: 0.45rem; border-radius: 50%; background: currentColor; }
.badge.ok { color: var(--status-ok); }
.badge.warn { color: var(--status-warn); }
.address { margin: -0.2rem 0 0; color: var(--text-muted); font-size: 0.9rem; }
.counts { margin: 0.2rem 0 0; color: var(--text-faint); font-size: 0.9rem; }
.counts b {
  display: block;
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.categories { display: flex; flex-wrap: wrap; gap: 0.35rem; list-style: none; padding: 0; margin: 0.15rem 0 0; }
.categories li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--line);
  background: var(--surface-accent);
  border-radius: 8px;
  padding: 0.15rem 0.55rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.categories b { color: var(--text); font-variant-numeric: tabular-nums; }
.categories .more { background: transparent; border-style: dashed; color: var(--text-faint); }
.note { margin: 0; font-size: 0.85rem; color: var(--status-warn); }
.school-foot {
  margin-top: auto;
  padding-top: 0.9rem;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.86rem;
}
.freshness { color: var(--text-faint); }
.visit { color: var(--accent); font-weight: 700; margin-left: auto; }
.school:hover .visit, .school:focus-visible .visit { text-decoration: underline; }
.empty {
  margin-top: 1.75rem;
  border: 1px dashed var(--line-strong);
  border-radius: 18px;
  background: var(--surface-soft);
  color: var(--text-muted);
  padding: 1.5rem;
}
.footer {
  margin-top: clamp(2.5rem, 6vh, 4rem);
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
  color: var(--text-faint);
  font-size: 0.84rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 2rem;
  justify-content: space-between;
}

/* Scoped to .js: with scripting off nothing ever adds .in, and an invisible page would be a
   far worse outcome than an unanimated one. */
.js [data-reveal] { opacity: 0; transform: translateY(14px); }
.js [data-reveal].in {
  opacity: 1;
  transform: none;
  transition: opacity 0.5s ease var(--delay, 0ms), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1) var(--delay, 0ms);
}
@media (max-width: 760px) {
  :root { --header-height: 60px; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem 1.5rem; }
  .schools.single { grid-template-columns: minmax(0, 1fr); }
  .header-link { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .school, .school h3 { transition: none; }
  .school:hover, .school:focus-visible { transform: none; }
  .cue .arrow { animation: none; }
  .js [data-reveal] { opacity: 1; transform: none; }
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
      : `<div class="schools${sorted.length === 1 ? ' single' : ''}">${sorted
          .map((school) => renderSchool(school, now, staleAfterMs))
          .join('\n')}</div>`

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
<script>${PAGE_SCRIPT}</script>
</head>
<body>
<header class="header">
  <div class="header-inner shell">
    <div class="logo"><span class="logo-mark" aria-hidden="true">HS</span>${escapeHtml(title)}</div>
    <div class="header-right">
      <a class="header-link" href="#directories">Directories</a>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch light or dark theme">
        <span aria-hidden="true">&#9681;</span>
      </button>
    </div>
  </div>
</header>
<main>
  <section class="hero">
    <div class="hero-inner shell">
      <span class="eyebrow">Club directories</span>
      <h1>Every school&#39;s clubs, on the school&#39;s own site.</h1>
      <p class="lead">Each school below runs its own directory. This page reads the public summary
      each one publishes and sends you straight there. It holds no club, no member and no login of
      its own.</p>
      <div class="stats">
        ${statCard('Schools', String(sorted.length))}
        ${statCard('Clubs listed', String(clubs))}
        ${statCard('Last checked', describeAge(lastPolled, now), true)}
      </div>
      <a class="cue" href="#directories">See the directories <span class="arrow" aria-hidden="true">&darr;</span></a>
    </div>
  </section>
  <section class="directories shell" id="directories">
    <div class="section-head">
      <h2>Directories</h2>
      <p class="section-note">Verified schools only &middot; checked ${escapeHtml(
        describeAge(lastPolled, now),
      )}</p>
    </div>
    ${body}
    <footer class="footer">
      <span>Pulled from each school&#39;s public summary. Nothing is ever written back.</span>
      <span>Generated ${escapeHtml(now.toISOString())}</span>
    </footer>
  </section>
</main>
</body>
</html>
`
}