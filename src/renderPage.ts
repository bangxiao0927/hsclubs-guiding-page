import type { PageSchool } from './pageData.js'
import type { SchoolRecord } from './store.js'

/**
 * Renders the page from what the poller stored.
 *
 * Server-rendered on every request, with no build step: the content is a handful of schools and
 * a freshness line, and a bundle would put a compile between the poller writing a number and a
 * visitor seeing it. Styling and typography are allowed to come from the network -- this is a
 * web page, not a terminal -- but everything the page *says* is already in the HTML, so a slow
 * or blocked font costs a font, never a fact.
 *
 * The palette and card language deliberately track a school site (the 1st repo's
 * frontend/src/assets), so arriving here and clicking through feels like one product.
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
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%232563eb'/%3E%3Ctext x='16' y='22' font-family='system-ui,sans-serif' font-size='14' font-weight='700' fill='white' text-anchor='middle'%3EHS%3C/text%3E%3C/svg%3E"
const FONTS =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap'

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
export const isStale = (
  record: SchoolRecord,
  now: Date,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): boolean => {
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
    return `<a class="school unavailable" href="${href}" rel="noopener noreferrer" data-reveal data-spot>
      <span class="school-top"><span class="host">${host}</span><span class="badge warn">No data</span></span>
      <h3>${escapeHtml(record.slug)}</h3>
      <p class="note">No data yet. ${escapeHtml(record.lastError ?? 'Never polled.')}</p>
      <span class="school-foot"><span class="visit">Open site <span class="chev" aria-hidden="true">&rarr;</span></span></span>
    </a>`
  }

  const stale = isStale(record, now, staleAfterMs)
  const note = record.lastError
    ? `<p class="note">Last poll failed: ${escapeHtml(record.lastError)}</p>`
    : ''

  return `<a class="school${
    stale ? ' stale' : ''
  }" href="${href}" rel="noopener noreferrer" data-reveal data-spot>
      <span class="school-top"><span class="host">${host}</span><span class="badge${
        stale ? ' warn' : ' ok'
      }">${stale ? 'Stale' : 'Live'}</span></span>
      <h3>${escapeHtml(summary.schoolName)}</h3>
      ${summary.address ? `<p class="address">${escapeHtml(summary.address)}</p>` : ''}
      <p class="counts"><b data-count="${escapeHtml(String(summary.clubCount))}">${escapeHtml(
        String(summary.clubCount),
      )}</b> <span>clubs</span></p>
      ${renderCategories(summary.categories)}
      ${note}
      <span class="school-foot">
        <span class="freshness">Clubs updated ${escapeHtml(describeAge(summary.lastUpdatedAt, now))}${
          stale ? ' (stale)' : ''
        }</span>
        <span class="visit">Open site <span class="chev" aria-hidden="true">&rarr;</span></span>
      </span>
    </a>`
}

/** `wide` is for a value that is a phrase rather than a number: "10 minutes ago" set at the
 *  numeral size drags the row out of alignment and reads as the most important fact on it. */
const statCard = (label: string, value: string, wide = false): string =>
  `<div class="stat${wide ? ' wide' : ''}"><p class="stat-value"${
    wide ? '' : ` data-count="${escapeHtml(value)}"`
  }>${escapeHtml(value)}</p><p class="stat-label">${escapeHtml(label)}</p></div>`

/**
 * Presentation only, and written so that every effect degrades to the plain page:
 *
 * - the stored theme is applied before first paint (same `theme` key the school site uses);
 * - reveal-on-scroll hides nothing unless this script has run, and a 1.2s timer shows anything
 *   an IntersectionObserver never reported -- a throttled observer costs an animation, not the
 *   content;
 * - counters start from the final number already in the HTML and only animate towards it;
 * - the pointer spotlight is a CSS variable, so no pointer means no spotlight and nothing else.
 */
const PAGE_SCRIPT = `(function(){var r=document.documentElement;try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark'){r.dataset.theme=s}}catch(e){}
r.className+=' js';
var calm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-theme-toggle]');if(!t)return;var dark=getComputedStyle(r).colorScheme==='dark';var next=dark?'light':'dark';r.dataset.theme=next;try{localStorage.setItem('theme',next)}catch(err){}});
function count(el){var target=parseFloat(el.getAttribute('data-count'));if(!isFinite(target)||calm)return;var t0=0;function step(t){if(!t0)t0=t;var k=Math.min(1,(t-t0)/900);el.textContent=Math.round(target*(1-Math.pow(1-k,3))).toLocaleString();if(k<1)requestAnimationFrame(step)}requestAnimationFrame(step)}
document.addEventListener('DOMContentLoaded',function(){
var els=[].slice.call(document.querySelectorAll('[data-reveal]'));
var show=function(el){if(el.classList.contains('in'))return;el.classList.add('in');[].forEach.call(el.querySelectorAll('[data-count]'),count)};
if(!window.IntersectionObserver){els.forEach(show)}else{
var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){show(entry.target);io.unobserve(entry.target)}})},{rootMargin:'0px 0px -8% 0px'});
els.forEach(function(el,i){el.style.setProperty('--delay',(i%6)*70+'ms');io.observe(el)});
setTimeout(function(){els.forEach(show)},1200)}
[].forEach.call(document.querySelectorAll('.stats [data-count]'),count);
if(!calm){document.addEventListener('pointermove',function(e){var c=e.target.closest&&e.target.closest('[data-spot]');if(!c)return;var b=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-b.left)+'px');c.style.setProperty('--my',(e.clientY-b.top)+'px')});
var bar=document.querySelector('.progress');if(bar){var tick=function(){var h=document.documentElement.scrollHeight-window.innerHeight;bar.style.transform='scaleX('+(h>0?window.scrollY/h:0)+')'};addEventListener('scroll',tick,{passive:true});tick()}}
})})()`

const DARK_TOKENS = `
  color-scheme: dark;
  --line: rgba(148, 180, 214, 0.14);
  --line-strong: rgba(125, 211, 252, 0.34);
  --accent: #60c5fa;
  --accent-2: #7c8cff;
  --accent-contrast: #06121f;
  --text: #f2f6fb;
  --text-muted: #a9b7c8;
  --text-faint: rgba(215, 226, 240, 0.58);
  --canvas: #070e1a;
  --glow-1: rgba(56, 189, 248, 0.3);
  --glow-2: rgba(124, 92, 255, 0.26);
  --grid: rgba(148, 180, 214, 0.085);
  --header-bg: rgba(5, 11, 20, 0.62);
  --surface: rgba(255, 255, 255, 0.045);
  --surface-2: rgba(255, 255, 255, 0.08);
  --card-edge: linear-gradient(150deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.02) 42%);
  --spot: rgba(96, 197, 250, 0.16);
  --status-ok: #5eead4;
  --status-warn: #fcd34d;
  --shadow: 0 30px 70px rgba(0, 0, 0, 0.5);
`

const STYLES = `
:root {
  color-scheme: light;
  --line: rgba(15, 23, 42, 0.09);
  --line-strong: rgba(37, 99, 235, 0.24);
  --accent: #2563eb;
  --accent-2: #7c3aed;
  --accent-contrast: #ffffff;
  --text: #0a1121;
  --text-muted: #4d5a6e;
  --text-faint: rgba(71, 85, 105, 0.72);
  --canvas: #f7f9fe;
  --glow-1: rgba(59, 130, 246, 0.18);
  --glow-2: rgba(124, 58, 237, 0.12);
  --grid: rgba(15, 23, 42, 0.06);
  --header-bg: rgba(247, 249, 254, 0.68);
  --surface: rgba(255, 255, 255, 0.72);
  --surface-2: rgba(255, 255, 255, 0.92);
  --card-edge: linear-gradient(150deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.25) 45%);
  --spot: rgba(37, 99, 235, 0.09);
  --status-ok: #0f9d70;
  --status-warn: #b45309;
  --shadow: 0 26px 60px rgba(15, 23, 42, 0.1);
  --page-width: min(1200px, 100%);
  --page-padding: clamp(1.15rem, 4vw, 3.5rem);
  --header-height: 70px;
  --display: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif;
  --body: Inter, 'Segoe UI', system-ui, sans-serif;
}
:root[data-theme='dark'] {${DARK_TOKENS}}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {${DARK_TOKENS}}
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--canvas); }
body {
  margin: 0;
  min-height: 100vh;
  /* The canvas colour lives on html. A background here would be painted over the negative
     z-index pseudo-elements below, which is exactly where the glow and the grid live. */
  background: transparent;
  color: var(--text);
  font-family: var(--body);
  font-size: 15.5px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
/* Two soft lights and a hairline grid, fixed behind everything: depth without a single image
   request, and nothing here shifts when the content does. */
body::before, body::after { content: ''; position: fixed; inset: 0; pointer-events: none; z-index: -1; }
body::before {
  background:
    radial-gradient(900px 520px at 8% -6%, var(--glow-1), transparent 62%),
    radial-gradient(760px 460px at 92% 2%, var(--glow-2), transparent 58%);
}
body::after {
  background-image: linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 68px 68px;
  mask-image: radial-gradient(1100px 700px at 50% 0%, #000 25%, transparent 78%);
  -webkit-mask-image: radial-gradient(1100px 700px at 50% 0%, #000 25%, transparent 78%);
}
.shell { width: var(--page-width); margin: 0 auto; padding-inline: var(--page-padding); }

.progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 2px;
  width: 100%;
  transform: scaleX(0);
  transform-origin: 0 50%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  z-index: 30;
}
.header {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--header-height);
  display: flex;
  align-items: center;
  background: var(--header-bg);
  border-bottom: 1px solid var(--line);
  backdrop-filter: saturate(180%) blur(16px);
}
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%; }
.logo { display: flex; align-items: center; gap: 0.7rem; font-family: var(--display); font-weight: 700; letter-spacing: -0.015em; }
.logo-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(140deg, var(--accent), var(--accent-2));
  color: #fff;
  font-size: 0.76rem;
  font-weight: 800;
  box-shadow: 0 8px 18px -6px var(--accent);
}
.header-right { display: flex; align-items: center; gap: 0.35rem; }
.header-link {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 0.4rem 0.75rem;
  border-radius: 9px;
  transition: color 0.2s ease, background 0.2s ease;
}
.header-link:hover { color: var(--text); background: var(--surface-2); }
.theme-toggle {
  border: 1px solid var(--line);
  background: var(--surface);
  color: inherit;
  border-radius: 10px;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.theme-toggle:hover { border-color: var(--line-strong); transform: translateY(-1px); }

.hero { min-height: calc(100svh - var(--header-height)); display: grid; align-items: center; }
.hero-inner { padding-block: clamp(3rem, 9vh, 6rem); }
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.32rem 0.85rem 0.32rem 0.6rem;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  backdrop-filter: blur(8px);
}
.pulse { position: relative; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--status-ok); }
.pulse::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid var(--status-ok);
  opacity: 0.5;
  animation: ping 2.4s ease-out infinite;
}
@keyframes ping { 0% { transform: scale(0.7); opacity: 0.6; } 80%, 100% { transform: scale(1.5); opacity: 0; } }
h1 {
  margin: 1.35rem 0 0;
  font-family: var(--display);
  font-size: clamp(2.6rem, 6.4vw, 4.75rem);
  line-height: 1.02;
  font-weight: 800;
  letter-spacing: -0.04em;
  max-width: 17ch;
}
h1 .grad {
  background: linear-gradient(100deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lead {
  margin: 1.35rem 0 0;
  max-width: 52ch;
  font-size: clamp(1rem, 1.5vw, 1.14rem);
  color: var(--text-muted);
}
.actions { margin-top: 2rem; display: flex; flex-wrap: wrap; gap: 0.75rem; }
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.72rem 1.25rem;
  border-radius: 12px;
  font-family: var(--display);
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}
.btn.primary {
  background: linear-gradient(140deg, var(--accent), var(--accent-2));
  color: #fff;
  box-shadow: 0 16px 34px -14px var(--accent);
}
.btn.primary:hover { transform: translateY(-2px); box-shadow: 0 22px 40px -14px var(--accent); }
.btn.ghost { border-color: var(--line); background: var(--surface); color: var(--text); }
.btn.ghost:hover { border-color: var(--line-strong); transform: translateY(-2px); }
.stats {
  margin-top: clamp(2.5rem, 7vh, 4rem);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, max-content));
  gap: clamp(1.5rem, 5vw, 4.5rem);
  align-items: end;
  border-top: 1px solid var(--line);
  padding-top: 1.6rem;
}
.stat-value {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.8rem, 3.6vw, 2.7rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  font-variant-numeric: tabular-nums;
}
.stat.wide .stat-value { font-size: clamp(1.15rem, 2vw, 1.55rem); font-weight: 700; letter-spacing: -0.02em; }
.stat-label {
  margin: 0.2rem 0 0;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.directories { padding-block: clamp(1.5rem, 4vh, 3rem) clamp(3rem, 8vh, 5.5rem); scroll-margin-top: var(--header-height); }
.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--line);
}
.section-head h2 { margin: 0; font-family: var(--display); font-size: 1.45rem; font-weight: 700; letter-spacing: -0.025em; }
.section-note { margin: 0; color: var(--text-faint); font-size: 0.9rem; }

.schools {
  margin-top: 1.85rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: 1.15rem;
}
.schools.single { grid-template-columns: minmax(0, 37rem); }
.school {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1.65rem;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  color: inherit;
  text-decoration: none;
  backdrop-filter: blur(14px);
  isolation: isolate;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.25s ease, box-shadow 0.25s ease;
}
/* A gradient hairline along the lit edge, and a spotlight that follows the pointer. Both are
   decoration painted under the content, so neither can swallow a click. */
.school::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: var(--card-edge);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0.9;
  pointer-events: none;
  z-index: -1;
}
.school::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(220px circle at var(--mx, 50%) var(--my, 0%), var(--spot), transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: -1;
}
.school:hover, .school:focus-visible { transform: translateY(-4px); border-color: var(--line-strong); }
.school:hover::after, .school:focus-visible::after { opacity: 1; }
.school:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.school.stale, .school.unavailable { background: var(--surface); border-style: dashed; }
.school-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.host { font-size: 0.82rem; color: var(--text-faint); }
.school h3 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  transition: color 0.2s ease;
}
.school:hover h3 { color: var(--accent); }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.badge::before { content: ''; width: 0.45rem; height: 0.45rem; border-radius: 50%; background: currentColor; }
.badge.ok { color: var(--status-ok); }
.badge.warn { color: var(--status-warn); }
.address { margin: -0.2rem 0 0; color: var(--text-muted); font-size: 0.9rem; }
.counts { margin: 0.35rem 0 0; display: flex; align-items: baseline; gap: 0.5rem; color: var(--text-faint); font-size: 0.9rem; }
.counts b {
  font-family: var(--display);
  font-size: 2.7rem;
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1;
  color: transparent;
  background: linear-gradient(140deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  font-variant-numeric: tabular-nums;
}
.categories { display: flex; flex-wrap: wrap; gap: 0.35rem; list-style: none; padding: 0; margin: 0.35rem 0 0; }
.categories li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: 9px;
  padding: 0.18rem 0.6rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.categories b { color: var(--text); font-variant-numeric: tabular-nums; }
.categories .more { background: transparent; border-style: dashed; color: var(--text-faint); }
.note { margin: 0; font-size: 0.85rem; color: var(--status-warn); }
.school-foot {
  margin-top: auto;
  padding-top: 0.95rem;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.86rem;
}
.freshness { color: var(--text-faint); }
.visit { margin-left: auto; color: var(--accent); font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem; }
.chev { transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
.school:hover .chev, .school:focus-visible .chev { transform: translateX(4px); }
.empty {
  margin-top: 1.85rem;
  border: 1px dashed var(--line-strong);
  border-radius: 20px;
  background: var(--surface);
  color: var(--text-muted);
  padding: 1.5rem;
}
.footer {
  margin-top: clamp(2.5rem, 6vh, 4rem);
  padding-top: 1.35rem;
  border-top: 1px solid var(--line);
  color: var(--text-faint);
  font-size: 0.84rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 2rem;
  justify-content: space-between;
}

.js [data-reveal] { opacity: 0; transform: translateY(16px); }
.js [data-reveal].in {
  opacity: 1;
  transform: none;
  transition: opacity 0.6s ease var(--delay, 0ms), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) var(--delay, 0ms);
}
@media (max-width: 760px) {
  :root { --header-height: 62px; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.3rem 1.5rem; }
  .schools.single { grid-template-columns: minmax(0, 1fr); }
  .header-link { display: none; }
  body::after { background-size: 44px 44px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .school, .school h3, .chev, .btn, .theme-toggle { transition: none; }
  .school:hover, .school:focus-visible, .btn:hover { transform: none; }
  .pulse::after { animation: none; }
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
<script>${PAGE_SCRIPT}</script>
</head>
<body>
<div class="progress" aria-hidden="true"></div>
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
      <span class="eyebrow"><span class="pulse" aria-hidden="true"></span>Verified school directories</span>
      <h1>Every school&#39;s clubs, on <span class="grad">the school&#39;s own site</span>.</h1>
      <p class="lead">Each school below runs its own directory. This page reads the public summary
      each one publishes and sends you straight there -- it holds no club, no member and no login
      of its own.</p>
      <div class="actions">
        <a class="btn primary" href="#directories">Browse directories <span aria-hidden="true">&rarr;</span></a>
        <a class="btn ghost" href="https://github.com/bangxiao0927/hsclubs-guiding-page" rel="noopener noreferrer">How it works</a>
      </div>
      <div class="stats">
        ${statCard('Schools', String(sorted.length))}
        ${statCard('Clubs listed', String(clubs))}
        ${statCard('Last checked', describeAge(lastPolled, now), true)}
      </div>
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
