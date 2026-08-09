import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { createPageServer } from './serve.js'

let server: ReturnType<typeof createPageServer> | null = null

const start = (render: () => Promise<string> | string) => {
  server = createPageServer({ render, port: 0 })
  return new Promise<string>((resolve) => {
    server!.once('listening', () => {
      const { port } = server!.address() as AddressInfo
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

describe('the page server', () => {
  it('renders on each request rather than serving a stored copy', async () => {
    let renders = 0
    const base = await start(() => `<p>render ${++renders}</p>`)

    expect(await (await fetch(base)).text()).toContain('render 1')
    expect(await (await fetch(`${base}/index.html`)).text()).toContain('render 2')
  })

  it('sends html that browsers are told not to cache', async () => {
    const base = await start(() => '<p>ok</p>')

    const response = await fetch(base)

    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 404 for anything but the page, and 405 for a write', async () => {
    const base = await start(() => '<p>ok</p>')

    expect((await fetch(`${base}/registry.json`)).status).toBe(404)
    expect((await fetch(base, { method: 'POST' })).status).toBe(405)
  })

  // A store that cannot be read is an operator problem, not a crash: the server has to stay up
  // and say what is wrong, or the one page that could explain the failure is the one that dies.
  it('reports a render failure without falling over', async () => {
    const base = await start(() => {
      throw new Error('store unreadable')
    })

    const response = await fetch(base)

    expect(response.status).toBe(500)
    expect(await response.text()).toContain('store unreadable')
    expect((await fetch(base)).status).toBe(500)
  })
})
