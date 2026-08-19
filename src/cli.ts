import { fileURLToPath } from 'node:url'

import { alertsFor, describeAlert, sendAlerts } from './alerts.js'
import { AlertLog } from './alertLog.js'
import { staleBuildWarning } from './buildFreshness.js'
import {
  computeManifest,
  loadFixtures,
  manifestDrift,
  readManifest,
  validateContract,
  MANIFEST_FILE,
} from './contracts.js'
import { loadRegistry, pollableSchools, type SchoolEntry } from './registry.js'
import { saveRegistry, withRegistryLock } from './registry.js'
import { pageSchools } from './pageData.js'
import { buildPayload } from './pagePayload.js'
import { pollAllSchools } from './pollAll.js'
import { pollSchool } from './pollSchool.js'
import { renderPage } from './renderPage.js'
import { runOnInterval } from './schedule.js'
import { createPageServer } from './serve.js'
import { SchoolStore, type SchoolRecord } from './store.js'
import { buildStatusPayload } from './statusPayload.js'
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
 *   npm run contracts:check          v1 fixtures against v1 schemas, and the shared checksums
 *   npm run contracts:manifest       rewrite contracts/v1/manifest.json after an edit
 *
 * Registry path from HSCLUBS_REGISTRY (default ./registry.json), store path from HSCLUBS_STORE
 * (default ./data/schools.json). Both are gitignored: the registry carries tokens, the store
 * carries other people's data.
 */
const registryPath = () => process.env['HSCLUBS_REGISTRY'] ?? 'registry.json'
const storePath = () => process.env['HSCLUBS_STORE'] ?? 'data/schools.json'
const alertPath = () => process.env['HSCLUBS_ALERT_STORE'] ?? 'data/alerts.json'

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
/** Where `npm run web:build` puts the browser app. Absent is a supported state, not an error. */
const webDir = () => process.env['HSCLUBS_WEB_DIR'] ?? fileURLToPath(new URL('../web/dist', import.meta.url))
const verificationIntervalMs = () =>
  positiveNumber('HSCLUBS_VERIFY_INTERVAL_MS', 30 * 24 * 60 * 60 * 1000)
const alertWebhook = () => process.env['HSCLUBS_ALERT_WEBHOOK'] ?? ''
/** Three hourly failures is a school that is actually down, not one that was restarting. */
const alertAfter = () => positiveNumber('HSCLUBS_ALERT_AFTER', 3)

/**
 * Reports the transitions in a pass: to the console always, and to a webhook if one is set.
 *
 * Console first, so an operator watching the log learns the same thing as the webhook, and so
 * that a misconfigured webhook is not the difference between knowing and not knowing.
 */
const reportAlerts = async (
  previous: Map<string, SchoolRecord>,
  store: SchoolStore,
): Promise<void> => {
  const events = alertsFor(previous, store.all(), alertAfter())
  if (events.length === 0) return
  for (const event of events) console.error(`ALERT: ${describeAlert(event)}`)

  // Persistent local delivery is unconditional; a remote webhook is an optional second copy.
  try {
    const log = await AlertLog.open(alertPath())
    await log.append(events)
  } catch (error) {
    // Alert storage is another delivery channel. Like a webhook, it must never end the watcher.
    console.error(`Could not store alert(s): ${error instanceof Error ? error.message : String(error)}`)
  }

  const webhook = alertWebhook()
  if (!webhook) return
  if (!(await sendAlerts(webhook, events))) {
    console.error(`Could not deliver ${events.length} alert(s) to HSCLUBS_ALERT_WEBHOOK`)
  }
}

const snapshot = (store: SchoolStore): Map<string, SchoolRecord> =>
  new Map(store.all().map((record) => [record.slug, record]))

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
  const before = snapshot(store)
  const report = await pollAllSchools(entries, store, {
    onSchool: ({ slug, outcome, error }) =>
      console.log(`${slug}: ${outcome}${error ? ` -- ${error}` : ''}`),
  })
  await reportAlerts(before, store)

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
      const before = snapshot(store)
      const report = await pollAllSchools(entries, store)
      console.log(
        `${report.startedAt}: ${report.updated} updated, ${report.unchanged} unchanged, ${report.failed} failed`,
      )
      await reportAlerts(before, store)
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
  // Read per request from the store, so nothing served is ever staler than what the poller has
  // written and there is no output file to keep in sync.
  const read = async () => {
    const [entries, store] = await Promise.all([
      loadRegistry(registryPath()),
      SchoolStore.open(storePath()),
    ])
    return pageSchools(entries, store)
  }

  const server = createPageServer({
    port: pagePort(),
    host: pageHost(),
    staticDir: webDir(),
    api: async () => buildPayload(await read(), { title: pageTitle() }),
    statusApi: async () => {
      const [store, alerts] = await Promise.all([
        SchoolStore.open(storePath()),
        AlertLog.open(alertPath()),
      ])
      return buildStatusPayload(store.all(), alerts.all())
    },
    // Used when web/dist has not been built. Keeping it means a fresh checkout serves a working
    // page with `npm run serve` alone, with no build step on the machine that polls.
    render: async () => renderPage(await read(), { title: pageTitle() }),
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

  // After the port is open, because a stale build is worth knowing about but is never a reason
  // to refuse to serve.
  const stale = await staleBuildWarning(webDir(), fileURLToPath(new URL('../web/src', import.meta.url)))
  if (stale) console.error(stale)

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
  return withRegistryLock(registryPath(), async () => {
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
  })
}

const verifyOne = async (slug: string): Promise<number> => {
  return withRegistryLock(registryPath(), async () => {
    const { entries, index } = await requireRegistryEntry(slug)
    const result = await verifySchool(entries[index]!)
    entries[index] = result.entry
    await saveRegistry(registryPath(), entries)

    if (result.verified) {
      console.log(`${slug}: verified`)
      return 0
    }
    console.error(
      `${slug}: ${result.transientFailure ? 'check could not finish' : 'verification failed'} -- ${
        result.entry.verification.lastError
      }`,
    )
    return 1
  })
}

const verifyOnePass = async (): Promise<number> => {
  return withRegistryLock(registryPath(), async () => {
    const entries = await loadRegistry(registryPath())
    const report = await verifyAllSchools(entries, {
      // Persist as each school finishes, just like polling: a monthly pass interrupted halfway
      // by sleep or shutdown keeps every verification it already completed. The registry lock
      // prevents another command from interleaving a write with these snapshots.
      onSchool: async (result) => {
        const entry = result.entry
        const index = entries.findIndex((current) => current.slug === entry.slug)
        if (index >= 0) entries[index] = entry
        await saveRegistry(registryPath(), entries)
        const outcome = result.verified
          ? 'verified'
          : result.transientFailure
            ? `check incomplete, keeping ${entry.verification.state}`
            : 'failing'
        console.log(
          `${entry.slug}: ${outcome}${
            entry.verification.lastError ? ` -- ${entry.verification.lastError}` : ''
          }`,
        )
      },
    })
    console.log(
      `verification pass done: ${report.verified} verified, ${report.failing} failing, ${
        report.transientFailures
      } transient failures, ${report.checked} checked`,
    )
    // Like poll:all, per-school failure is data in the registry, not a broken job.
    return 0
  })
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

/**
 * Checks the shared v1 artifact: every fixture against its schema, and every file against the
 * recorded checksums.
 *
 * Both halves matter. The fixtures prove the schemas say what they mean; the checksums prove the
 * copies in the school template and the app are this copy, which is the only thing that keeps
 * three repositories from each fixing a contract bug in their own direction.
 */
const checkContracts = (): number => {
  let failures = 0
  for (const fixture of loadFixtures()) {
    const violations = validateContract(fixture.contract, fixture.body)
    const valid = violations.length === 0
    if (valid === fixture.expectValid) continue
    failures += 1
    console.error(
      fixture.expectValid
        ? `${fixture.contract}/${fixture.file}: expected valid, but ${violations
            .map((violation) => `${violation.path || '/'} ${violation.message}`)
            .join('; ')}`
        : `${fixture.contract}/${fixture.file}: expected a violation, but the schema accepted it`,
    )
  }

  const drift = manifestDrift(readManifest(), computeManifest())
  for (const [kind, files] of Object.entries(drift)) {
    for (const file of files) {
      failures += 1
      console.error(`manifest.json is out of date: ${file} ${kind}`)
    }
  }

  if (failures > 0) {
    console.error(`${failures} contract check(s) failed`)
    return 1
  }
  console.log('contracts v1: fixtures and checksums agree')
  return 0
}

const writeContractsManifest = async (): Promise<number> => {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(MANIFEST_FILE, `${JSON.stringify(computeManifest(), null, 2)}\n`, 'utf8')
  console.log(`wrote ${MANIFEST_FILE}`)
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
    case 'contracts:check':
      return checkContracts()
    case 'contracts:manifest':
      return writeContractsManifest()
    case undefined:
      console.error(
        'Usage: npm run poll -- <slug> | npm run poll:all | npm run watch | npm run serve | npm run verify:* | npm run contracts:*',
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
