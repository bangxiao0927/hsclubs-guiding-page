import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { AlertEvent } from './alerts.js'

export interface StoredAlert extends AlertEvent {
  at: string
}

/**
 * A small, persistent alert inbox for the status page.
 *
 * Webhooks are delivery, not storage: Slack can be unavailable, a URL can be rotated, and the
 * watch process can restart. Keeping the transitions beside the school store means the current
 * state and the reason it changed survive all three. The cap prevents a forgotten installation
 * from growing a JSON file forever.
 */
export class AlertLog {
  private constructor(
    private readonly path: string,
    private alerts: StoredAlert[],
  ) {}

  static async open(path: string): Promise<AlertLog> {
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
      if (!Array.isArray(raw)) return new AlertLog(path, [])
      const alerts = raw.filter(isStoredAlert).slice(-200)
      return new AlertLog(path, alerts)
    } catch {
      // Like the school store, this is derived operational state. A missing/corrupt file costs
      // history, never the watcher or the page.
      return new AlertLog(path, [])
    }
  }

  all(): StoredAlert[] {
    return [...this.alerts].reverse()
  }

  async append(events: AlertEvent[], at = new Date().toISOString()): Promise<void> {
    if (events.length === 0) return
    this.alerts = [...this.alerts, ...events.map((event) => ({ ...event, at }))].slice(-200)
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = join(dirname(this.path), `.${Date.now()}-${process.pid}.alerts.tmp`)
    await writeFile(temporary, `${JSON.stringify(this.alerts, null, 2)}\n`, 'utf8')
    await rename(temporary, this.path)
  }
}

const isStoredAlert = (value: unknown): value is StoredAlert => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item['slug'] === 'string' &&
    (item['kind'] === 'failing' || item['kind'] === 'recovered') &&
    typeof item['streak'] === 'number' &&
    typeof item['at'] === 'string' &&
    (typeof item['error'] === 'string' || item['error'] === null)
  )
}