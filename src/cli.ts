import { loadRegistry, pollableSchools } from './registry.js'
import { pollSchool } from './pollSchool.js'
import { SchoolStore } from './store.js'

/**
 * Phase 1 (docs/ROADMAP.md): read one school.
 *
 *   npm run poll -- <slug>
 *
 * Registry path from HSCLUBS_REGISTRY (default ./registry.json), store path from HSCLUBS_STORE
 * (default ./data/schools.json). Both are gitignored: the registry carries tokens, the store
 * carries other people's data.
 */
const main = async (): Promise<number> => {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: npm run poll -- <slug>')
    return 2
  }

  const registryPath = process.env['HSCLUBS_REGISTRY'] ?? 'registry.json'
  const storePath = process.env['HSCLUBS_STORE'] ?? 'data/schools.json'

  const registry = await loadRegistry(registryPath)
  const entry = pollableSchools(registry).find((school) => school.slug === slug)
  if (!entry) {
    const known = registry.map((school) => school.slug).join(', ') || '(none)'
    console.error(
      `No verified, listed school with slug "${slug}" in ${registryPath}. Known slugs: ${known}`,
    )
    return 1
  }

  const store = await SchoolStore.open(storePath)
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

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
