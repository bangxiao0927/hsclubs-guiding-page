import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { staleBuildWarning } from './buildFreshness.js'

const at = (path: string, secondsFromNow: number) => {
  const when = new Date(Date.now() + secondsFromNow * 1000)
  return utimes(path, when, when)
}

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'hsclubs-build-'))
  const dist = join(root, 'dist')
  const src = join(root, 'src', 'components')
  await mkdir(dist, { recursive: true })
  await mkdir(src, { recursive: true })
  await writeFile(join(dist, 'index.html'), '<html></html>', 'utf8')
  await writeFile(join(root, 'src', 'App.tsx'), 'export const App = () => null', 'utf8')
  await writeFile(join(src, 'Card.tsx'), 'export const Card = () => null', 'utf8')
  return { root, dist, src: join(root, 'src') }
}

describe('staleBuildWarning', () => {
  it('says nothing when the build is newer than every source', async () => {
    const { dist, src } = await project()
    await at(join(dist, 'index.html'), 60)

    expect(await staleBuildWarning(dist, src)).toBeNull()
  })

  // The forgotten build is invisible otherwise: the page still works, it is just yesterday's
  // app talking to today's API.
  it('names the command to run when a source is newer, however deep it is', async () => {
    const { dist, src } = await project()
    await at(join(dist, 'index.html'), -60)

    expect(await staleBuildWarning(dist, src)).toContain('npm run build')
  })

  // Running with no build at all is supported, not a mistake.
  it('says nothing when there is no build and nothing to compare', async () => {
    const { root, src } = await project()

    expect(await staleBuildWarning(join(root, 'missing'), src)).toBeNull()
    expect(await staleBuildWarning(join(root, 'dist'), join(root, 'no-sources'))).toBeNull()
  })
})