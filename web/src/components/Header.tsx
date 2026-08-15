import type { Theme } from '../useTheme'

export const Header = ({
  title,
  theme,
  onToggleTheme,
  onOpenSwitcher,
}: {
  title: string
  theme: Theme
  onToggleTheme: () => void
  onOpenSwitcher?: () => void
}) => (
  <header className="sticky top-0 z-20 h-[70px] flex items-center border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-xl backdrop-saturate-150">
    <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-[clamp(1.15rem,4vw,3.5rem)]">
      <div className="font-display flex items-center gap-2.5 font-bold tracking-tight">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-[10px] bg-linear-140 from-[var(--accent)] to-[var(--accent-2)] text-[0.76rem] font-extrabold text-white shadow-[0_8px_18px_-6px_var(--accent)]"
        >
          HS
        </span>
        {title}
      </div>
      <div className="flex items-center gap-1">
        <a
          href="#directories"
          className="hidden rounded-[9px] px-3 py-1.5 text-[0.9rem] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:block"
        >
          Directories
        </a>
        {onOpenSwitcher && (
          <button
            type="button"
            onClick={onOpenSwitcher}
            aria-label="Switch school app"
            className="grid h-9 w-9 cursor-pointer grid-cols-3 place-content-center gap-[2px] rounded-[10px] border border-[var(--line)] bg-[var(--surface)] transition hover:-translate-y-px hover:border-[var(--line-strong)]"
          >
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="h-[3px] w-[3px] rounded-full bg-current" aria-hidden />
            ))}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="h-9 w-9 cursor-pointer rounded-[10px] border border-[var(--line)] bg-[var(--surface)] text-[0.9rem] transition hover:-translate-y-px hover:border-[var(--line-strong)]"
        >
          <span aria-hidden>{theme === 'dark' ? '\u2600' : '\u25D1'}</span>
        </button>
      </div>
    </div>
  </header>
)
