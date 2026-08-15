import { Stat } from './Stat'
import type { PagePayload } from '../types'

export const Hero = ({ totals }: { totals: PagePayload['totals'] }) => (
  <section className="grid min-h-[calc(100svh-70px)] items-center">
    <div className="mx-auto w-full max-w-[1200px] px-[clamp(1.15rem,4vw,3.5rem)] py-[clamp(3rem,9vh,6rem)]">
      <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-2.5 pr-3.5 text-[0.78rem] font-semibold text-[var(--text-muted)] backdrop-blur">
        <span className="pulse-ring relative h-2 w-2 rounded-full bg-[var(--ok)] text-[var(--ok)]" aria-hidden />
        Verified school directories
      </span>
      <h1 className="font-display mt-5 max-w-[17ch] text-[clamp(2.6rem,6.4vw,4.75rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
        Every school&rsquo;s clubs, on <span className="gradient-text">the school&rsquo;s own site</span>.
      </h1>
      <p className="mt-5 max-w-[52ch] text-[clamp(1rem,1.5vw,1.14rem)] text-[var(--text-muted)]">
        Each school below runs its own directory. This page reads the public summary each one
        publishes and sends you straight there &mdash; it holds no club, no member and no login of
        its own.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="#directories"
          className="font-display inline-flex items-center gap-2 rounded-xl bg-linear-140 from-[var(--accent)] to-[var(--accent-2)] px-5 py-3 text-[0.95rem] font-bold text-white shadow-[0_16px_34px_-14px_var(--accent)] transition hover:-translate-y-0.5"
        >
          Browse directories <span aria-hidden>&rarr;</span>
        </a>
        <a
          href="https://github.com/bangxiao0927/hsclubs-guiding-page"
          rel="noopener noreferrer"
          className="font-display inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-[0.95rem] font-bold transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
        >
          How it works
        </a>
      </div>
      <div className="mt-[clamp(2.5rem,7vh,4rem)] grid grid-cols-2 items-end gap-6 border-t border-[var(--line)] pt-6 sm:grid-cols-[repeat(3,max-content)] sm:gap-[clamp(1.5rem,5vw,4.5rem)]">
        <Stat label="Schools" value={totals.schools} />
        <Stat label="Clubs listed" value={totals.clubs} />
        <Stat label="Last checked" value={totals.checkedAge} />
      </div>
    </div>
  </section>
)