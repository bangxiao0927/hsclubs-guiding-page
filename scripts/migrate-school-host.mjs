#!/usr/bin/env node
// Renames one school's slug and repoints its summary URL across the operated files that key on
// slug: registry.json, the school store, and the alert log. This is the cutover companion to a
// school moving to a new hostname (for this deployment: hsclubs -> mvhs).
//
// Nothing here touches the school's data or verification token. Verification is still required
// afterwards, because control of a *host* is what the challenge proves and the new host is a
// different host.
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const REGISTRY = process.env.HSCLUBS_REGISTRY ?? 'registry.json'
const STORE = process.env.HSCLUBS_STORE ?? 'data/schools.json'
const ALERTS = process.env.HSCLUBS_ALERT_STORE ?? 'data/alerts.json'

const stripBom = (contents) =>
  contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents

const fail = (message) => {
  console.error(`migrate-school-host: ${message}`)
  process.exit(1)
}

const usage = () => {
  console.log(`Usage: node scripts/migrate-school-host.mjs [options]

Rename a school slug and repoint its summary URL in the operated registry and stores.
Defaults are this deployment's hsclubs -> mvhs move. Dry-run unless --apply is passed.

Options:
  --old-slug <slug>   slug to rename            (default: hsclubs)
  --new-slug <slug>   target slug               (default: mvhs)
  --new-url <url>     target summary URL        (default: https://mvhs.hsclubs.net/api/summary)
  --apply             write the changes         (default: dry-run)
  --verify            after --apply, run "npm run verify -- <new-slug>"
  --help              show this help

Environment (same as the CLI):
  HSCLUBS_REGISTRY, HSCLUBS_STORE, HSCLUBS_ALERT_STORE

Stop "npm run watch" and "npm run serve" before applying: they hold their own in-memory copies
and a running watcher can overwrite the store while this script is editing it.
`)
}

const parseArgs = (argv) => {
  const options = {
    oldSlug: 'hsclubs',
    newSlug: 'mvhs',
    newUrl: 'https://mvhs.hsclubs.net/api/summary',
    apply: false,
    verify: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = () => argv[index + 1]
    switch (arg) {
      case '--old-slug':
        options.oldSlug = value()
        index += 1
        break
      case '--new-slug':
        options.newSlug = value()
        index += 1
        break
      case '--new-url':
        options.newUrl = value()
        index += 1
        break
      case '--apply':
        options.apply = true
        break
      case '--verify':
        options.verify = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        fail(`unknown argument: ${arg}\n\n${usageText}`)
    }
  }
  return options
}

const usageText = 'Run with --help for usage.'

const readJson = async (path) => {
  try {
    return JSON.parse(stripBom(await readFile(path, 'utf8')))
  } catch (error) {
    fail(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const writeJsonAtomic = async (path, value) => {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.${Date.now()}-${process.pid}.migrate.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

const backupPath = (path, stamp) => join('data', 'backups', stamp, basename(path))

const backup = async (path, stamp) => {
  const target = backupPath(path, stamp)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(path, target)
  return target
}

const plan = (title, changes) => {
  console.log(title)
  if (changes.length === 0) {
    console.log('  (no change)')
    return
  }
  for (const change of changes) console.log(`  ${change}`)
}

const applyChanges = async (options) => {
  const { oldSlug, newSlug, newUrl } = options
  if (!newUrl.startsWith('https://')) fail('--new-url must start with https://')
  if (oldSlug === newSlug) fail('--old-slug and --new-slug must differ')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const registry = await readJson(REGISTRY)
  if (!Array.isArray(registry.schools)) fail(`${REGISTRY} must contain a schools array`)

  const entryIndex = registry.schools.findIndex((school) => school?.slug === oldSlug)
  if (entryIndex < 0) fail(`no school with slug "${oldSlug}" in ${REGISTRY}`)
  if (registry.schools.some((school) => school?.slug === newSlug)) {
    fail(`a school with slug "${newSlug}" already exists in ${REGISTRY}`)
  }

  const registryChanges = [
    `${oldSlug}.slug -> ${newSlug}`,
    `${oldSlug}.summaryUrl -> ${newUrl} (was ${registry.schools[entryIndex].summaryUrl})`,
  ]
  plan(`${REGISTRY}:`, registryChanges)

  const store = await readJson(STORE)
  const storeChanges = []
  if (typeof store !== 'object' || store === null || Array.isArray(store)) {
    fail(`${STORE} must be a JSON object keyed by slug`)
  }
  if (Object.hasOwn(store, oldSlug)) {
    if (Object.hasOwn(store, newSlug)) fail(`both ${oldSlug} and ${newSlug} exist in ${STORE}`)
    storeChanges.push(`key ${oldSlug} -> ${newSlug}`)
    storeChanges.push(`${oldSlug}.summary.slug -> ${newSlug} (keeps cached history)`)
  } else {
    storeChanges.push(`(no cached record for ${oldSlug}; nothing to rename)`)
  }
  plan(`${STORE}:`, storeChanges)

  const alerts = await readJson(ALERTS)
  const alertChanges = []
  if (!Array.isArray(alerts)) fail(`${ALERTS} must be a JSON array`)
  const affectedAlerts = alerts.filter((alert) => alert?.slug === oldSlug).length
  if (affectedAlerts > 0) {
    alertChanges.push(`${affectedAlerts} alert(s): slug ${oldSlug} -> ${newSlug}`)
  } else {
    alertChanges.push('(no alerts for this school)')
  }
  plan(`${ALERTS}:`, alertChanges)

  if (!options.apply) {
    console.log('\nDry run -- no files were written. Add --apply to make the change.')
    return
  }

  const registryBackup = await backup(REGISTRY, stamp)
  registry.schools[entryIndex] = { ...registry.schools[entryIndex], slug: newSlug, summaryUrl: newUrl }

  const newStore = { ...store }
  if (Object.hasOwn(newStore, oldSlug)) {
    const cachedSummary =
      newStore[oldSlug].summary == null ? null : { ...newStore[oldSlug].summary, slug: newSlug }
    newStore[newSlug] = {
      ...newStore[oldSlug],
      slug: newSlug,
      summary: cachedSummary,
    }
    delete newStore[oldSlug]
  }

  const newAlerts = alerts.map((alert) => (alert?.slug === oldSlug ? { ...alert, slug: newSlug } : alert))

  await writeJsonAtomic(REGISTRY, registry)
  await writeJsonAtomic(STORE, newStore)
  await writeJsonAtomic(ALERTS, newAlerts)

  console.log(`\nWrote ${REGISTRY}, ${STORE}, ${ALERTS}.`)
  console.log(`Backups are in ${backupPath(REGISTRY, stamp)}, ${backupPath(STORE, stamp)}, ${backupPath(ALERTS, stamp)}.`)

  if (options.verify) {
    console.log(`\nRe-verifying ${newSlug} on its new host...`)
    // Node cannot spawn a .cmd shim directly on every Windows release. Go through cmd.exe there;
    // POSIX keeps the direct exec path so no shell is involved when it is not needed.
    const windows = process.platform === 'win32'
    const result = spawnSync('npm', ['run', 'verify', '--', newSlug], {
      stdio: 'inherit',
      shell: windows,
    })
    if (result.error) {
      console.error(`\nCould not start verification: ${result.error.message}`)
      process.exit(1)
    }
    if (result.status !== 0) {
      console.error(`\nVerification did not succeed (exit ${result.status ?? 'signal'}). Fix it before restarting the watcher.`)
      process.exit(result.status ?? 1)
    }
  } else {
    console.log('\nNow re-verify the new host before restarting the watcher: npm run verify -- ' + newSlug)
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.help) usage()
else await applyChanges(options)
