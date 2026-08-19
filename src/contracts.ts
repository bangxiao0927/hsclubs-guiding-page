import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
// Named import, not the default one: ajv is CommonJS, and its default export is the module
// object under nodenext resolution, which is not constructable.
import {
  Ajv2020,
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js'

/**
 * The v1 contracts three repositories share, and the one function that decides whether a
 * document honours one.
 *
 * The schemas and fixtures under contracts/v1 are the artifact; this module is only the way
 * this repository reads them. The school template and the iOS app vendor the same directory and
 * check it against contracts/v1/manifest.json, so "we all agree on the contract" is a checksum
 * comparison rather than three prose documents that drifted apart.
 *
 * See contracts/v1/README.md for the rules the schemas cannot state: what may be added, what
 * may never change, and how long the unversioned endpoints stay.
 */
export const CONTRACT_VERSION = 1

export const CONTRACT_NAMES = [
  'summary',
  'school-manifest',
  'app-directory',
  'mobile-auth-start',
  'mobile-auth-callback',
  'mobile-auth-complete-request',
  'mobile-auth-complete-response',
  'mobile-auth-error',
] as const

export type ContractName = (typeof CONTRACT_NAMES)[number]

const here = dirname(fileURLToPath(import.meta.url))

/** Root of the shared artifact, the directory other repositories copy verbatim. */
export const contractsDir = resolve(here, '..', 'contracts', `v${CONTRACT_VERSION}`)

const schemasDir = join(contractsDir, 'schemas')
const fixturesDir = join(contractsDir, 'fixtures')

export const MANIFEST_FILE = join(contractsDir, 'manifest.json')

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))

// strictRequired off: two schemas require a member from inside an `if/then`, where the member is
// declared on the parent object. That is the point of the rule -- "claim mobile auth, then say
// where it starts" -- and repeating the declarations inside the branch to satisfy the check
// would create two places to edit one type.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })

// Every schema is registered before any is compiled: mobile-auth-callback refers to the error
// schema's code list, and a $ref that resolves only sometimes is worse than one that never does.
for (const name of CONTRACT_NAMES) {
  ajv.addSchema(readJson(join(schemasDir, `${name}.schema.json`)) as AnySchemaObject)
}

const validators = new Map<ContractName, ValidateFunction>()

const validatorFor = (name: ContractName): ValidateFunction => {
  const cached = validators.get(name)
  if (cached) return cached
  const compiled = ajv.getSchema(`https://schemas.hsclubs.net/v${CONTRACT_VERSION}/${name}.schema.json`)
  if (!compiled) throw new Error(`contract ${name} has no schema`)
  validators.set(name, compiled)
  return compiled
}

export interface ContractViolation {
  /** JSON Pointer into the document, '' for the document itself. */
  path: string
  message: string
}

const describe = (error: ErrorObject): ContractViolation => ({
  path: error.instancePath,
  message: `${error.message ?? 'is invalid'}${
    error.keyword === 'additionalProperties' && typeof error.params['additionalProperty'] === 'string'
      ? `: ${error.params['additionalProperty']}`
      : ''
  }`,
})

/** Every way `body` fails `name`, or an empty list when it honours the contract. */
export const validateContract = (name: ContractName, body: unknown): ContractViolation[] => {
  const validate = validatorFor(name)
  if (validate(body)) return []
  return (validate.errors ?? []).map(describe)
}

export const honoursContract = (name: ContractName, body: unknown): boolean =>
  validateContract(name, body).length === 0

export interface ContractFixture {
  contract: ContractName
  /** File name, whose `valid-`/`invalid-` prefix is the expectation. */
  file: string
  path: string
  expectValid: boolean
  body: unknown
}

/**
 * The fixtures for one contract, or for all of them.
 *
 * The expectation lives in the file name so a repository that cannot run this TypeScript -- the
 * Java template, the Swift app -- still knows what each fixture is for without a parallel index
 * that someone will forget to update.
 */
export const loadFixtures = (name?: ContractName): ContractFixture[] => {
  const names = name ? [name] : [...CONTRACT_NAMES]
  return names.flatMap((contract) => {
    const dir = join(fixturesDir, contract)
    return readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => {
        if (!file.startsWith('valid-') && !file.startsWith('invalid-') && file !== 'valid.json') {
          throw new Error(`fixture ${contract}/${file} must be named valid*.json or invalid-*.json`)
        }
        return {
          contract,
          file,
          path: join(dir, file),
          expectValid: !file.startsWith('invalid-'),
          body: readJson(join(dir, file)),
        }
      })
  })
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )

export interface ContractManifest {
  contract: 'hsclubs.contracts'
  version: number
  /** Relative POSIX path -> sha-256 of the file's bytes, hex. */
  files: Record<string, string>
}

/**
 * Digests of every shared file, for a consumer to prove its copy is this copy.
 *
 * The manifest itself is excluded, and paths are POSIX regardless of the platform that computed
 * them, so a checkout on Windows and one on CI produce the same document.
 *
 * Line endings are normalised to LF before hashing for the same reason: .gitattributes pins them
 * already, but a digest that a checkout can invalidate would send whoever hits it looking for a
 * contract change that never happened.
 */
export const computeManifest = (): ContractManifest => {
  const files: Record<string, string> = {}
  for (const file of walk(contractsDir).sort()) {
    if (file === MANIFEST_FILE) continue
    const key = relative(contractsDir, file).split(sep).join('/')
    const content = readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
    files[key] = createHash('sha256').update(content, 'utf8').digest('hex')
  }
  return { contract: 'hsclubs.contracts', version: CONTRACT_VERSION, files }
}

export const readManifest = (): ContractManifest => {
  try {
    return readJson(MANIFEST_FILE) as ContractManifest
  } catch (error) {
    throw new Error(
      `could not read ${MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}. ` +
        'Run `npm run contracts:manifest` after editing anything under contracts/.',
    )
  }
}

export interface ManifestDrift {
  added: string[]
  removed: string[]
  changed: string[]
}

export const manifestDrift = (recorded: ContractManifest, actual: ContractManifest): ManifestDrift => {
  const recordedFiles = recorded.files ?? {}
  const actualFiles = actual.files
  return {
    added: Object.keys(actualFiles).filter((file) => !(file in recordedFiles)),
    removed: Object.keys(recordedFiles).filter((file) => !(file in actualFiles)),
    changed: Object.keys(actualFiles).filter(
      (file) => file in recordedFiles && recordedFiles[file] !== actualFiles[file],
    ),
  }
}
