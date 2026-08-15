import type { SchoolStatus } from '../types'

const LABEL: Record<SchoolStatus, string> = { live: 'Live', stale: 'Stale', 'no-data': 'No data' }

export const StatusBadge = ({ status }: { status: SchoolStatus }) => (
  <span
    className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.1em]"
    style={{ color: status === 'live' ? 'var(--ok)' : 'var(--warn)' }}
  >
    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
    {LABEL[status]}
  </span>
)

export const DemoBadge = () => (
  <span className="inline-flex items-center rounded-full border border-dashed border-[var(--warn)]/60 bg-[var(--surface-2)] px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[var(--warn)]">
    Demonstration
  </span>
)
