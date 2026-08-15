import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Warns when web/dist is older than the sources it was built from.
 *
 * The server prefers the built app and falls back to the rendered page, so a forgotten
 * `npm run build` is invisible: the page still works, it is just yesterday's app talking to
 * today's API. That is the kind of failure that gets diagnosed as "the browser cached it".
 */
const newestMtime = async (dir: string): Promise<number> => {
  let newest = 0
  const walk = async (path: string): Promise<void> => {
    const entries = await readdir(path, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const child = join(path, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'dist') return
          return walk(child)
        }
        const info = await stat(child)
        newest = Math.max(newest, info.mtimeMs)
      }),
    )
  }
  await walk(dir)
  return newest
}

/**
 * @returns a sentence to print, or null when there is nothing to say -- including when there is
 * no build at all, which is a supported way to run rather than a mistake.
 */
export const staleBuildWarning = async (
  webDir: string,
  sourceDir: string,
): Promise<string | null> => {
  let built: number
  try {
    built = (await stat(join(webDir, 'index.html'))).mtimeMs
  } catch {
    return null
  }

  let newestSource: number
  try {
    newestSource = await newestMtime(sourceDir)
  } catch {
    // No sources to compare against: a deployment that shipped dist alone is not stale.
    return null
  }

  if (newestSource <= built) return null
  return `web/dist is older than web/src -- serving a stale app. Run: npm run build`
}