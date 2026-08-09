import { loadRegistry, pollableSchools, type SchoolEntry } from './registry.js'
import { pollAllSchools } from './pollAll.js'
import { pollSchool } from './pollSchool.js'
import { runOnInterval } from './schedule.js'
import { SchoolStore } from './store.js'

/**
 * The operator's entry point (docs/ROADMAP.md).
 *
 *   npm run poll -- <slug>   one school, once
 *   npm run poll:all         every listed, verified school, once
 *   npm run watch            every school, now and then on an interval
 *
 * Registry path from HSCLUBS_REGISTRY (default ./registry.json), store path from HSCLUBS_STORE
 * (default ./data/schools.json). Both are gitignored: the registry carries tokens, the store
 * carries other people's data.
 */
const registryPath = () => process.env['HSCLUBS_REGISTRY'] ?? 'registry.json'
const storePath = () => process.env['HSCLUBS_STORE'] ?? 'data/schools.json'

/** Default hourly: this reads a directory that changes weekly. */
const intervalMs = () => Number(process.env['HSCLUBS_POLL_INTERVAL_MS'] ?? 60 * 60 * 1000)

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

const main = async (): Promise<number> => {
  const command = process.argv[2]
  switch (command) {
    case 'all':
      return runOnePass()
    case 'watch':
      return watch()
    case undefined:
      console.error('Usage: npm run poll -- <slug> | npm run poll:all | npm run watch')
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
