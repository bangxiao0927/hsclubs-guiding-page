import { createServer, type Server } from 'node:http'

/**
 * Serves the rendered page, and nothing else.
 *
 * One route, one document, rendered on request from what the poller stored -- so the page is
 * never staler than the store, and there is no build step or output file to keep in sync. Bound
 * to localhost by default: this is a private page on a personal machine (see the 1st repo's
 * docs/AGGREGATOR_BRIDGE.md), and a listener that answers the whole network is not something to
 * turn on by accident.
 */
export interface ServeOptions {
  port?: number
  host?: string
  render: () => Promise<string> | string
}

export const createPageServer = ({ render, host = '127.0.0.1', port = 4180 }: ServeOptions): Server =>
  createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end()
      return
    }
    const path = (req.url ?? '/').split('?')[0]
    if (path !== '/' && path !== '/index.html') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
      return
    }

    void Promise.resolve()
      .then(render)
      .then((html) => {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          // The page is a view of data that changes under it; a cached copy would show a
          // freshness line that is itself stale.
          'cache-control': 'no-store',
        })
        res.end(req.method === 'HEAD' ? undefined : html)
      })
      .catch((error: unknown) => {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(`Could not render the page: ${error instanceof Error ? error.message : String(error)}\n`)
      })
  }).listen(port, host)
