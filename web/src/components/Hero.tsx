import type { PagePayload, School } from '../types'
import { DirectoryNetwork } from './DirectoryNetwork'
import { Stat } from './Stat'

export const Hero = ({
  totals,
  schools,
}: {
  totals: PagePayload['totals']
  schools: School[]
}) => (
  <section className="grid min-h-[calc(100svh-70px)] items-center">
    <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-[clamp(1.15rem,4vw,3.5rem)] py-[clamp(3rem,8vh,5.5rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(390px,0.92fr)] lg:gap-14">
      <div>
        <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-2.5 pr-3.5 text-[0.78rem] font-semibold text-[var(--text-muted)] backdrop-blur">
          <span className="pulse-ring relative h-2 w-2 rounded-full bg-[var(--ok)] text-[var(--ok)]" aria-hidden />
          Verified school directories
        </span>
        <h1 className="font-display mt-5 max-w-[13ch] text-[clamp(2.6rem,5.7vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
          Every school&rsquo;s clubs, on <span className="gradient-text">the school&rsquo;s own site</span>.
        </h1>
        <p className="mt-5 max-w-[50ch] text-[clamp(1rem,1.4vw,1.12rem)] text-[var(--text-muted)]">
          One trusted guide to independent school directories. Search, compare and move straight
          to the source &mdash; no copied rosters, no central login, no stale catalogue in between.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#directories"
            className="font-display inline-flex items-center gap-2 rounded-xl bg-linear-140 from-[var(--accent)] to-[var(--accent-2)] px-5 py-3 text-[0.95rem] font-bold text-white shadow-[0_16px_34px_-14px_var(--accent)] transition hover:-translate-y-0.5"
          >
            Explore directories <span aria-hidden>&rarr;</span>
          </a>
          <a
            href="https://github.com/bangxiao0927/hsclubs-guiding-page"
            rel="noopener noreferrer"
            className="font-display inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-[0.95rem] font-bold transition hover:-translate-y-0.5 hover:border-[var(--line-strong)]"
          >
            How verification works
          </a>
        </div>
        <div className="mt-[clamp(2.5rem,6vh,3.5rem)] grid grid-cols-2 items-end gap-6 border-t border-[var(--line)] pt-6 [&>div:last-child]:col-span-2 sm:grid-cols-[repeat(3,max-content)] sm:gap-[clamp(1.5rem,4vw,3.5rem)] sm:[&>div:last-child]:col-span-1">
          <Stat label="Schools" value={totals.schools} />
          <Stat label="Clubs listed" value={totals.clubs} />
          <Stat label="Last checked" value={totals.checkedAge} />
        </div>
      </div>
      <div className="hidden lg:block">
        <DirectoryNetwork schools={schools} />
      </div>
    </div>
  </section>
)
