import { useEffect, useMemo, useState } from 'react'

import { Controls } from './components/Controls'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { SchoolCard } from './components/SchoolCard'
import { SchoolDrawer } from './components/SchoolDrawer'
import { allCategories, filterByCategories, searchSchools, sortSchools, type SortKey } from './filters'
import type { PagePayload, School } from './types'
import { useTheme } from './useTheme'

type State =
  | { status: 'loading' }
  | { status: 'ready'; payload: PagePayload }
  | { status: 'failed'; message: string }

const Skeleton = () => (
  <div className="mt-7 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(330px,1fr))]">
    {[0, 1, 2].map((key) => (
      <div
        key={key}
        className="h-[260px] animate-pulse rounded-[20px] border border-[var(--line)] bg-[var(--surface)]"
      />
    ))}
  </div>
)

export const App = () => {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [theme, toggleTheme] = useTheme()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState<School | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/schools')
      .then((response) => {
        if (!response.ok) throw new Error(`the server answered ${response.status}`)
        return response.json() as Promise<PagePayload>
      })
      .then((payload) => live && setState({ status: 'ready', payload }))
      .catch((error: unknown) => {
        if (!live) return
        setState({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => {
      live = false
    }
  }, [])

  const payload = state.status === 'ready' ? state.payload : null
  const schools = payload?.schools ?? []
  const categories = useMemo(() => allCategories(schools), [schools])
  const visible = useMemo(
    () => sortSchools(filterByCategories(searchSchools(schools, query), selected), sort),
    [schools, query, selected, sort],
  )

  useEffect(() => {
    if (payload) document.title = payload.title
  }, [payload])

  const totals = payload?.totals ?? { schools: 0, clubs: 0, checkedAge: 'never' }

  return (
    <>
      <Header title={payload?.title ?? 'HS Clubs'} theme={theme} onToggleTheme={toggleTheme} />
      <main>
        <Hero totals={totals} />
        <section
          id="directories"
          className="mx-auto w-full max-w-[1200px] scroll-mt-[70px] px-[clamp(1.15rem,4vw,3.5rem)] pb-[clamp(3rem,8vh,5.5rem)] pt-[clamp(1.5rem,4vh,3rem)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-[var(--line)] pb-5">
            <h2 className="font-display m-0 text-[1.45rem] font-bold tracking-[-0.025em]">Directories</h2>
            <p className="m-0 text-[0.9rem] text-[var(--text-faint)]">
              Verified schools only &middot; checked {totals.checkedAge}
            </p>
          </div>

          {state.status === 'loading' && <Skeleton />}

          {state.status === 'failed' && (
            <p className="mt-7 rounded-[20px] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-[var(--warn)]">
              Could not load the directories: {state.message}. The poller writes this page&rsquo;s data
              on a schedule; try again in a moment.
            </p>
          )}

          {state.status === 'ready' && schools.length === 0 && (
            <p className="mt-7 rounded-[20px] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-[var(--text-muted)]">
              No schools yet. Verify a school and it appears here.
            </p>
          )}

          {state.status === 'ready' && schools.length > 0 && (
            <>
              <Controls
                query={query}
                onQuery={setQuery}
                sort={sort}
                onSort={setSort}
                categories={categories}
                selected={selected}
                onToggleCategory={(name) =>
                  setSelected((current) =>
                    current.includes(name)
                      ? current.filter((value) => value !== name)
                      : [...current, name],
                  )
                }
                onClear={() => setSelected([])}
              />

              {visible.length === 0 ? (
                <p className="mt-7 rounded-[20px] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-[var(--text-muted)]">
                  No school matches that. Clear the search or the filters to see all{' '}
                  {schools.length}.
                </p>
              ) : (
                <div
                  className={`mt-7 grid gap-4 ${
                    visible.length === 1
                      ? '[grid-template-columns:minmax(0,37rem)]'
                      : '[grid-template-columns:repeat(auto-fit,minmax(330px,1fr))]'
                  }`}
                >
                  {visible.map((school) => (
                    <SchoolCard key={school.slug} school={school} onOpen={setOpen} />
                  ))}
                </div>
              )}
            </>
          )}

          <footer className="mt-[clamp(2.5rem,6vh,4rem)] flex flex-wrap justify-between gap-x-8 gap-y-2 border-t border-[var(--line)] pt-5 text-[0.84rem] text-[var(--text-faint)]">
            <span>Pulled from each school&rsquo;s public summary. Nothing is ever written back.</span>
            {payload && <span>Generated {payload.generatedAt}</span>}
          </footer>
        </section>
      </main>
      <SchoolDrawer school={open} onClose={() => setOpen(null)} />
    </>
  )
}