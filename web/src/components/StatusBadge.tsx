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