import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

/**
 * Serves the browser app, its data, and nothing else.
 *
 * Three responsibilities, in the order a request meets them: the JSON the app reads, the built
 * assets, and then the document -- either web/dist/index.html or, when no build exists, the
 * server-rendered page. That fallback is deliberate: a checkout with no `npm run web:build` is
 * still a working page, so nobody has to keep a build alive on the machine that polls.
 *
 * Bound to localhost by default: this is a private page on a personal machine (see the 1st
 * repo's docs/AGGREGATOR_BRIDGE.md), and a listener that answers the whole network is not
 * something to turn on by accident.
 */
export interface ServeOptions {
  port?: number
  host?: string
  /** The server-rendered fallback document. */
  render: () => Promise<string> | string
  /** The payload behind GET /api/schools. */
  api?: () => Promise<unknown> | unknown
  /** The payload behind GET /api/v1/schools, the minimal directory the iOS app reads. */
  appApi?: () => Promise<unknown> | unknown
  /** Operational state and recent alert transitions behind GET /api/status. */
  statusApi?: () => Promise<unknown> | unknown
  /**
   * The Apple App Site Association JSON, or null when no production app id is configured.
   *
   * A function so the server can be built before the app id is known, and so an unconfigured
   * deployment answers 404 rather than serving a placeholder association that would let the
   * wrong build claim the callback.
   */
  appleAppSiteAssociation?: () => unknown | null
  /** The static fallback page for GET /mobile-auth/callback. */
  mobileAuthFallback?: () => string
  /** Directory of built assets, if one has been built. */
  staticDir?: string | null
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

/**
 * Resolves a URL path inside the asset directory, or null.
 *
 * The check is on the resolved path rather than on the request string: `%2e%2e`, backslashes and
 * doubled separators all survive a textual check and none of them survive this one.
 */
const assetPath = (staticDir: string, urlPath: string): string | null => {
  const root = resolve(staticDir)
  const candidate = resolve(join(root, normalize(decodeURIComponent(urlPath))))
  return candidate === root || candidate.startsWith(root + sep) ? candidate : null
}

const sendFile = async (res: import('node:http').ServerResponse, file: string, head: boolean) => {
  const info = await stat(file)
  if (!info.isFile()) throw new Error('not a file')

  // Vite fingerprints asset filenames, so those are safe to cache hard; index.html and anything
  // else must not be, or a visitor keeps yesterday's app after a deploy.
  const immutable = /\/assets\//.test(file.replaceAll('\\', '/')) && extname(file) !== '.html'
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
  })
  if (head) {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

export const createPageServer = ({
  render,
  api,
  appApi,
  statusApi,
  appleAppSiteAssociation,
  mobileAuthFallback,
  staticDir = null,
  host = '127.0.0.1',
  port = 4180,
}: ServeOptions): Server =>
  createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end()
      return
    }
    const head = req.method === 'HEAD'
    const path = (req.url ?? '/').split('?')[0] ?? '/'

    const fail = (error: unknown) => {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(
        `Could not render the page: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    }

    // The Apple App Site Association: application/json, no extension, and safe to cache for a
    // short while. Served only when an app id is configured; otherwise 404, never a placeholder.
    if (path === '/.well-known/apple-app-site-association') {
      const association = appleAppSiteAssociation?.()
      if (!association) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
        return
      }
      const body = JSON.stringify(association)
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'public, max-age=3600',
      })
      res.end(head ? undefined : body)
      return
    }

    // The Universal Link fallback. Static, and it must stay static: it never reads the query, so
    // a one-time code that lands here instead of in the app is shown to no one and expires.
    if (path === '/mobile-auth/callback') {
      if (!mobileAuthFallback) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
        return
      }
      const body = mobileAuthFallback()
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
      })
      res.end(head ? undefined : body)
      return
    }

    if (path === '/api/schools' || path === '/api/v1/schools' || path === '/api/status') {
      const build =
        path === '/api/status' ? statusApi : path === '/api/v1/schools' ? appApi : api
      if (!build) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
        return
      }
      void Promise.resolve()
        .then(build)
        .then((payload) => {
          const body = JSON.stringify(payload)
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(body),
            // A view of data that changes under it; a cached copy would show a freshness line
            // that is itself stale.
            'cache-control': 'no-store',
          })
          res.end(head ? undefined : body)
        })
        .catch(fail)
      return
    }

    const document = () =>
      Promise.resolve()
        .then(render)
        .then((html) => {
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(head ? undefined : html)
        })
        .catch(fail)

    // Named app routes get the same document. Unknown paths remain 404 rather than a blanket
    // SPA fallback that turns a misspelled asset into HTML and hides deployment mistakes.
    const isDocument = path === '/' || path === '/index.html' || path === '/status'
    if (!staticDir) {
      if (!isDocument) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
        return
      }
      void document()
      return
    }

    const file = assetPath(staticDir, isDocument ? '/index.html' : path)
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
      return
    }
    void sendFile(res, file, head).catch(() => {
      // A missing built file is only an error for an asset request. For the document it means
      // there is no build here, which is a supported way to run: render the fallback.
      if (isDocument) {
        void document()
        return
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
    })
  }).listen(port, host)
