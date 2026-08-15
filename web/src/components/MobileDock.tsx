const Icon = ({ name }: { name: 'guide' | 'browse' | 'apps' }) => {
  if (name === 'guide') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
      </svg>
    )
  }
  if (name === 'browse') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4.5 4.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      {[5, 12, 19].flatMap((x) => [5, 12, 19].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.65" />))}
    </svg>
  )
}

/** Thumb-reachable navigation for the three things this mobile page does. */
export const MobileDock = ({ onOpenSwitcher }: { onOpenSwitcher: () => void }) => {
  const item = 'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold text-[var(--text-muted)] transition active:scale-95'
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center rounded-2xl border border-[var(--line)] bg-[var(--header-bg)] px-2 shadow-[0_16px_55px_rgba(0,0,0,.3)] backdrop-blur-xl backdrop-saturate-150 sm:hidden"
    >
      <a href="#top" className={item}>
        <Icon name="guide" />
        Guide
      </a>
      <a href="#directories" className={item}>
        <Icon name="browse" />
        Browse
      </a>
      <button type="button" onClick={onOpenSwitcher} className={`${item} cursor-pointer`}>
        <Icon name="apps" />
        Schools
      </button>
    </nav>
  )
}