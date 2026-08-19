import { isDemoSchoolId } from './schoolId.js'
import type { SchoolEntry } from './registry.js'

/**
 * Whether every real school is ready for the app to be released.
 *
 * The app is the last thing to ship (see docs/RELEASE_RUNBOOK.md), and it must not ship until each
 * real school has an immutable identity, is verified, and had its manifest checked clean. Demo
 * schools are reported but never block a release -- a fixture is not something a person signs into,
 * so it does not gate authentication.
 *
 * This reads the registry, which is where verification and the manifest check already record their
 * results; it does not re-hit the network, so it is a fast pre-flight the runbook can run before
 * the slower end-to-end gate.
 */
export interface SchoolReadiness {
  slug: string
  demo: boolean
  ready: boolean
  /** Empty when ready; otherwise the reasons, in the operator's vocabulary. */
  blockers: string[]
}

export interface ReleaseReadiness {
  ready: boolean
  schools: SchoolReadiness[]
}

export const assessSchool = (entry: SchoolEntry): SchoolReadiness => {
  const demo = entry.demo === true || (entry.schoolId !== undefined && isDemoSchoolId(entry.schoolId))
  const blockers: string[] = []

  if (entry.schoolId === undefined) {
    blockers.push('no immutable schoolId has been issued')
  }
  if (entry.verification.state !== 'verified') {
    blockers.push(`verification is ${entry.verification.state}, not verified`)
  }
  const integration = entry.integration
  if (!integration) {
    blockers.push('the manifest has not been checked yet')
  } else if (integration.state !== 'ok') {
    blockers.push(`manifest check is ${integration.state}${integration.detail ? ` (${integration.detail})` : ''}`)
  }

  // A demo school is reported but never blocks: force it ready regardless of the checks above.
  return { slug: entry.slug, demo, ready: demo || blockers.length === 0, blockers: demo ? [] : blockers }
}

export const assessRelease = (entries: SchoolEntry[]): ReleaseReadiness => {
  const schools = entries.filter((entry) => entry.listed).map(assessSchool)
  // Only real schools gate the release.
  const ready = schools.filter((school) => !school.demo).every((school) => school.ready)
  return { ready, schools }
}
