import type { SchoolRecord } from './store.js'

/**
 * Renders the page from what the poller stored. No framework and no build step: this is a list
 * of a handful of schools, and every dependency here would be one more thing to keep alive on a
 * machine that is meant to be left alone.
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

const renderCategories = (categories: Record<string, number>): string => {
  const entries = Object.entries(categories).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return ''
  return `<ul class="categories">${entries
    .map(
      ([name, count]) =>
        `<li><span>${escapeHtml(name)}</span><b>${escapeHtml(String(count))}</b></li>`,
    )
    .join('')}</ul>`
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

const renderSchool = (record: SchoolRecord, now: Date, staleAfterMs: number): string => {
  const summary = record.summary
  if (!summary) {
    // Listed but never successfully read: say so rather than silently omitting the school, or
    // nobody will ever notice a school that has been broken since the day it was added.
    return `<article class="school unavailable">
      <h2>${escapeHtml(record.slug)}</h2>
      <p class="note">No data yet. ${escapeHtml(record.lastError ?? 'Never polled.')}</p>
    </article>`
  }

  const stale = isStale(record, now, staleAfterMs)
  const note = record.lastError
    ? `<p class="note">Last poll failed: ${escapeHtml(record.lastError)}</p>`
    : ''

  return `<article class="school${stale ? ' stale' : ''}">
      <h2>${escapeHtml(summary.schoolName)}</h2>
      ${summary.address ? `<p class="address">${escapeHtml(summary.address)}</p>` : ''}
      <p class="counts"><b>${escapeHtml(String(summary.clubCount))}</b> clubs</p>
      ${renderCategories(summary.categories)}
      <p class="freshness">Updated ${escapeHtml(describeAge(record.lastUpdatedAt, now))}${
        stale ? ' (stale)' : ''
      }</p>
      ${note}
    </article>`
}

export const renderPage = (records: SchoolRecord[], options: RenderOptions = {}): string => {
  const now = options.now ?? new Date()
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS
  const title = options.title ?? 'HS Clubs'

  const schools = [...records].sort((a, b) => {
    const nameA = a.summary?.schoolName ?? a.slug
    const nameB = b.summary?.schoolName ?? b.slug
    return nameA.localeCompare(nameB)
  })

  const body =
    schools.length === 0
      ? '<p class="empty">No schools yet.</p>'
      : schools.map((record) => renderSchool(record, now, staleAfterMs)).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; --line: color-mix(in srgb, currentColor 15%, transparent); }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 52rem; padding: 2rem 1rem; }
h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
.generated { opacity: 0.6; font-size: 0.85rem; margin-top: 0; }
.school { border: 1px solid var(--line); border-radius: 0.75rem; padding: 1rem 1.25rem; margin: 1rem 0; }
.school h2 { font-size: 1.15rem; margin: 0 0 0.25rem; }
.address { margin: 0 0 0.5rem; opacity: 0.75; }
.counts { margin: 0.25rem 0; }
.categories { display: flex; flex-wrap: wrap; gap: 0.4rem; list-style: none; padding: 0; margin: 0.5rem 0; }
.categories li { border: 1px solid var(--line); border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.85rem; }
.categories b { margin-left: 0.35rem; }
.freshness { font-size: 0.85rem; opacity: 0.7; margin: 0.5rem 0 0; }
.note { font-size: 0.85rem; margin: 0.25rem 0 0; opacity: 0.8; }
.stale, .unavailable { border-style: dashed; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="generated">Generated ${escapeHtml(now.toISOString())} from each school's public summary.</p>
${body}
</body>
</html>
`
}
