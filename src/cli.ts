import { loadRegistry, pollableSchools, type SchoolEntry } from './registry.js'
import { saveRegistry } from './registry.js'
import { pollAllSchools } from './pollAll.js'
import { pollSchool } from './pollSchool.js'
import { renderPage } from './renderPage.js'
import { runOnInterval } from './schedule.js'
import { createPageServer } from './serve.js'
import { SchoolStore } from './store.js'
import { verifyAllSchools } from './verifyAll.js'
import { challengeUrlFor, issueVerificationToken, verifySchool } from './verifySchool.js'

/**
 * The operator's entry point (docs/ROADMAP.md).
 *
 *   npm run poll -- <slug>   one school, once
 *   npm run poll:all         every listed, verified school, once
 *   npm run watch            every school, now and then on an interval
 *   npm run serve            the page, rendered from the store on each request
 *   npm run verify:issue -- <slug>   issue a one-time origin challenge token
 *   npm run verify -- <slug>         check one school's challenge + summary identity
 *   npm run verify:all               re-check every listed school once
 *   npm run verify:watch             re-check now, then monthly by default
 *
 * Registry path from HSCLUBS_REGISTRY (default ./registry.json), store path from HSCLUBS_STORE
 * (default ./data/schools.json). Both are gitignored: the registry carries tokens, the store
 * carries other people's data.
 */
const registryPath = () => process.env['HSCLUBS_REGISTRY'] ?? 'registry.json'
const storePath = () => process.env['HSCLUBS_STORE'] ?? 'data/schools.json'

/**
 * A misread number here reaches other people's servers: `HSCLUBS_POLL_INTERVAL_MS=1h` is NaN,
 * which setTimeout treats as 1ms, and the watcher would hammer every school in the registry
 * because of one typo. Anything that is not a positive finite number falls back, loudly.
 */
const positiveNumber = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name}=${raw} is not a positive number; using ${fallback}`)
    return fallback
  }
  return value
}

/** Default hourly: this reads a directory that changes weekly. */
const intervalMs = () => positiveNumber('HSCLUBS_POLL_INTERVAL_MS', 60 * 60 * 1000)
const pageTitle = () => process.env['HSCLUBS_PAGE_TITLE'] ?? 'HS Clubs'
const pagePort = () => positiveNumber('HSCLUBS_PORT', 4180)
const pageHost = () => process.env['HSCLUBS_HOST'] ?? '127.0.0.1'
const verificationIntervalMs = () =>
  positiveNumber('HSCLUBS_VERIFY_INTERVAL_MS', 30 * 24 * 60 * 60 * 1000)

const loadPollable = async (): Promise<SchoolEntry[]> => pollableSchools(await loadRegistry(registryPath()))

const pollOne = async (slug: string): Promise<number> => {
  const registry = await loadRegistry(registryPath())
  const entry = pollableSchools(registry).find((school) => school.slug === slug)
  if (!entry) {
    const known = registry.map((school) => school.slug).join(', ') || '(none)'
    console.error(
      `No verified, listed school with slug "${slug}" in ${registryPath()}. Known slugs: ${known}`,
    )
    return 1
  }

  const store = await SchoolStore.open(storePath())
  const { outcome, record } = await pollSchool(entry, store.get(slug))
  await store.put(record)

  switch (outcome) {
    case 'updated':
      console.log(
        `${slug}: updated -- ${record.summary?.clubCount ?? 0} clubs, etag ${record.etag ?? '(none)'}`,
      )
      return 0
    case 'not-modified':
      console.log(`${slug}: unchanged (304)`)
      return 0
    case 'failed':
      console.error(`${slug}: poll failed -- ${record.lastError ?? 'unknown error'}`)
      // A school being down is not this program failing; the exit code says "nothing new was
      // stored", and the reason is on the record for the page to explain.
      return 1
  }
}

const runOnePass = async (): Promise<number> => {
  const entries = await loadPollable()
  if (entries.length === 0) {
    console.error(`No verified, listed schools in ${registryPath()}`)
    return 1
  }

  const store = await SchoolStore.open(storePath())
  const report = await pollAllSchools(entries, store, {
    onSchool: ({ slug, outcome, error }) =>
      console.log(`${slug}: ${outcome}${error ? ` -- ${error}` : ''}`),
  })

  console.log(
    `pass done: ${report.updated} updated, ${report.unchanged} unchanged, ${report.failed} failed`,
  )
  // Zero even when some schools failed: the pass itself worked, and each school's own state says
  // what happened. Anything else would make a single flaky school look like a broken job.
  return 0
}

const watch = async (): Promise<number> => {
  const controller = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`\n${signal} received, stopping after the current pass`)
      controller.abort()
    })
  }

  const interval = intervalMs()
  console.log(`watching ${registryPath()}, polling every ${Math.round(interval / 1000)}s`)

  await runOnInterval(
    async () => {
      // Re-read the registry every pass, so adding or unlisting a school does not need a
      // restart -- the operator edits a file, and the next pass respects it.
      const entries = await loadPollable()
      const store = await SchoolStore.open(storePath())
      const report = await pollAllSchools(entries, store)
      console.log(
        `${report.startedAt}: ${report.updated} updated, ${report.unchanged} unchanged, ${report.failed} failed`,
      )
    },
    {
      intervalMs: interval,
      signal: controller.signal,
      onError: (error) =>
        console.error(`pass failed: ${error instanceof Error ? error.message : String(error)}`),
    },
  )
  return 0
}

const serve = async (): Promise<number> => {
  // Rendered per request from the store, so the page is never staler than what the poller has
  // written and there is no output file to keep in sync.
  const server = createPageServer({
    port: pagePort(),
    host: pageHost(),
    render: async () => renderPage((await SchoolStore.open(storePath())).all(), { title: pageTitle() }),
  })

  const listening = await new Promise<string | null>((resolve) => {
    // Without an error listener Node rethrows this as an uncaught exception with a stack trace,
    // and the likeliest cause is the most ordinary one: the operator already has a copy running.
    server.once('error', (error: NodeJS.ErrnoException) =>
      resolve(
        error.code === 'EADDRINUSE'
          ? `${pageHost()}:${pagePort()} is already in use -- is another copy already serving?`
          : `Could not listen on ${pageHost()}:${pagePort()}: ${error.message}`,
      ),
    )
    server.once('listening', () => {
      console.log(`serving http://${pageHost()}:${pagePort()} from ${storePath()}`)
      resolve(null)
    })
  })
  if (listening) {
    console.error(listening)
    return 1
  }

  await new Promise<void>((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        console.log(`\n${signal} received, closing`)
        server.close(() => resolve())
      })
    }
  })
  return 0
}

const requireRegistryEntry = async (slug: string): Promise<{ entries: SchoolEntry[]; index: number }> => {
  const entries = await loadRegistry(registryPath())
  const index = entries.findIndex((entry) => entry.slug === slug)
  if (index < 0) {
    const known = entries.map((entry) => entry.slug).join(', ') || '(none)'
    throw new Error(`No school with slug "${slug}". Known slugs: ${known}`)
  }
  return { entries, index }
}

const issueToken = async (slug: string): Promise<number> => {
  const { entries, index } = await requireRegistryEntry(slug)
  const current = entries[index]!
  const token = issueVerificationToken()
  entries[index] = {
    ...current,
    verification: {
      ...current.verification,
      token,
      state: 'pending',
      verifiedAt: null,
      lastCheckedAt: null,
      lastError: null,
    },
  }
  await saveRegistry(registryPath(), entries)

  console.log(`${slug}: new verification token issued`)
  console.log(`Publish exactly this line at ${challengeUrlFor(current.summaryUrl)}`)
  console.log(token)
  return 0
}

const verifyOne = async (slug: string): Promise<number> => {
  const { entries, index } = await requireRegistryEntry(slug)
  const result = await verifySchool(entries[index]!)
  entries[index] = result.entry
  await saveRegistry(registryPath(), entries)

  if (result.verified) {
    console.log(`${slug}: verified`)
    return 0
  }
  console.error(`${slug}: verification failed -- ${result.entry.verification.lastError}`)
  return 1
}

const verifyOnePass = async (): Promise<number> => {
  const entries = await loadRegistry(registryPath())
  const report = await verifyAllSchools(entries, {
    onSchool: (entry) =>
      console.log(
        `${entry.slug}: ${entry.verification.state}${
          entry.verification.lastError ? ` -- ${entry.verification.lastError}` : ''
        }`,
      ),
  })
  await saveRegistry(registryPath(), report.entries)
  console.log(
    `verification pass done: ${report.verified} verified, ${report.failing} failing, ${report.checked} checked`,
  )
  // Like poll:all, per-school failure is data in the registry, not a broken job.
  return 0
}

const verifyWatch = async (): Promise<number> => {
  const controller = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => controller.abort())
  }
  const interval = verificationIntervalMs()
  console.log(`re-verifying ${registryPath()} every ${Math.round(interval / 86_400_000)} days`)

  await runOnInterval(
    async () => {
      await verifyOnePass()
    },
    {
      intervalMs: interval,
      signal: controller.signal,
      onError: (error) =>
        console.error(`verification pass failed: ${error instanceof Error ? error.message : String(error)}`),
    },
  )
  return 0
}

const main = async (): Promise<number> => {
  const command = process.argv[2]
  const argument = process.argv[3]
  switch (command) {
    case 'all':
      return runOnePass()
    case 'watch':
      return watch()
    case 'serve':
      return serve()
    case 'verify:issue':
      if (!argument) throw new Error('Usage: npm run verify:issue -- <slug>')
      return issueToken(argument)
    case 'verify':
      if (!argument) throw new Error('Usage: npm run verify -- <slug>')
      return verifyOne(argument)
    case 'verify:all':
      return verifyOnePass()
    case 'verify:watch':
      return verifyWatch()
    case undefined:
      console.error(
        'Usage: npm run poll -- <slug> | npm run poll:all | npm run watch | npm run serve | npm run verify:*',
      )
      return 2
    default:
      return pollOne(command)
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
