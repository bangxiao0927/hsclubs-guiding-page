import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createPageServer } from './serve.js'

let server: ReturnType<typeof createPageServer> | null = null

const start = (options: Omit<Parameters<typeof createPageServer>[0], 'port'>) => {
  server = createPageServer({ ...options, port: 0 })
  return new Promise<string>((resolve) => {
    server!.once('listening', () => {
      const { port } = server!.address() as AddressInfo
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

const builtApp = async (html = '<div id="root">built</div>') => {
  const dir = await mkdtemp(join(tmpdir(), 'hsclubs-web-'))
  await writeFile(join(dir, 'index.html'), html, 'utf8')
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)', 'utf8')
  return dir
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

describe('the page server', () => {
  it('renders on each request rather than serving a stored copy', async () => {
    let renders = 0
    const base = await start({ render: () => `<p>render ${++renders}</p>` })

    expect(await (await fetch(base)).text()).toContain('render 1')
    expect(await (await fetch(`${base}/index.html`)).text()).toContain('render 2')
  })

  it('sends html that browsers are told not to cache', async () => {
    const base = await start({ render: () => '<p>ok</p>' })

    const response = await fetch(base)

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 404 for anything but the page, and 405 for a write', async () => {
    const base = await start({ render: () => '<p>ok</p>' })

    expect((await fetch(`${base}/registry.json`)).status).toBe(404)
    expect((await fetch(base, { method: 'POST' })).status).toBe(405)
  })

  // A store that cannot be read is an operator problem, not a crash: the server has to stay up
  // and say what is wrong, or the one page that could explain the failure is the one that dies.
  it('reports a render failure without falling over', async () => {
    const base = await start({
      render: () => {
        throw new Error('store unreadable')
      },
    })

    const response = await fetch(base)

    expect(response.status).toBe(500)
    expect(await response.text()).toContain('store unreadable')
    expect((await fetch(base)).status).toBe(500)
  })

  describe('the data the app reads', () => {
    it('serves the payload as uncached JSON', async () => {
      const base = await start({ render: () => '<p>ok</p>', api: () => ({ schools: [] }) })

      const response = await fetch(`${base}/api/schools`)

      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ schools: [] })
    })

    it('serves the app directory on its own versioned route', async () => {
      const base = await start({
        render: () => '<p>ok</p>',
        api: () => ({ schools: ['web'] }),
        appApi: () => ({ contract: 'hsclubs.app-directory', version: 1, schools: [] }),
      })

      // The app route and the web route are answered by different builders: the app must never
      // be handed the browser payload it is not shaped to decode.
      expect(await (await fetch(`${base}/api/v1/schools`)).json()).toEqual({
        contract: 'hsclubs.app-directory',
        version: 1,
        schools: [],
      })
      expect(await (await fetch(`${base}/api/schools`)).json()).toEqual({ schools: ['web'] })
    })

    it('answers the app route 404 when no directory builder is configured', async () => {
      const base = await start({ render: () => '<p>ok</p>', api: () => ({ schools: [] }) })

      expect((await fetch(`${base}/api/v1/schools`)).status).toBe(404)
    })

    it('reports a failure to build the payload as a 500, not a crash', async () => {
      const base = await start({
        render: () => '<p>ok</p>',
        api: () => {
          throw new Error('registry unreadable')
        },
      })

      const response = await fetch(`${base}/api/schools`)

      expect(response.status).toBe(500)
      expect(await response.text()).toContain('registry unreadable')
    })

    it('serves operational state separately from directory content', async () => {
      const base = await start({
        render: () => '<p>ok</p>',
        api: () => ({ schools: [] }),
        statusApi: () => ({ state: 'healthy', alerts: [] }),
      })

      expect(await (await fetch(`${base}/api/status`)).json()).toEqual({
        state: 'healthy',
        alerts: [],
      })
    })
  })

  describe('with a built app', () => {
    it('serves the built document and its assets', async () => {
      const base = await start({ render: () => '<p>fallback</p>', staticDir: await builtApp() })

      const document = await fetch(base)
      expect(await document.text()).toContain('built')
      expect(document.headers.get('cache-control')).toBe('no-store')
      expect(await (await fetch(`${base}/status`)).text()).toContain('built')

      const asset = await fetch(`${base}/assets/app-abc123.js`)
      expect(asset.status).toBe(200)
      expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
      // Vite fingerprints these names, so the copy at this URL can never change.
      expect(asset.headers.get('cache-control')).toContain('immutable')
    })

    // The poller machine must not need a build to serve a page.
    it('falls back to the rendered page when nothing has been built', async () => {
      const empty = await mkdtemp(join(tmpdir(), 'hsclubs-web-empty-'))
      const base = await start({ render: () => '<p>fallback</p>', staticDir: empty })

      expect(await (await fetch(base)).text()).toContain('fallback')
      expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
    })

    // The asset directory is the only thing this process may hand out.
    it('refuses to walk out of the asset directory', async () => {
      const dir = await builtApp()
      const base = await start({ render: () => '<p>fallback</p>', staticDir: dir })

      for (const attempt of [
        '/../secret.txt',
        '/..%2fsecret.txt',
        '/assets/../../secret.txt',
        '/%2e%2e/%2e%2e/registry.json',
      ]) {
        const response = await fetch(`${base}${attempt}`)
        expect([404, 400]).toContain(response.status)
      }
    })
  })
})
