import { useCallback, useEffect, useMemo, useState } from 'react'

import { Controls } from './components/Controls'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { MobileDock } from './components/MobileDock'
import { SchoolCard } from './components/SchoolCard'
import { SchoolDrawer } from './components/SchoolDrawer'
import { SchoolSwitcher } from './components/SchoolSwitcher'
import { filterByCategories, searchSchools, sortSchools, type SortKey } from './filters'
import type { PagePayload, School } from './types'
import { useTheme } from './useTheme'
import { readViewState, writeViewState } from './urlState'

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

const Notice = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) => (
  <p
    className={`mt-7 rounded-[20px] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 ${
      tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--text-muted)]'
    }`}
  >
    {children}
  </p>
)

export const App = () => {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [theme, toggleTheme] = useTheme()
  const [view, setView] = useState(() => readViewState(location.search))
  const [open, setOpen] = useState<School | null>(null)
  const [switcher, setSwitcher] = useState(false)

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

  // The view is part of the address, so a link someone sends carries what they were looking at.
  // replaceState rather than pushState: typing a query is not five history entries.
  useEffect(() => {
    history.replaceState(null, '', `${location.pathname}${writeViewState(view)}`)
  }, [view])

  useEffect(() => {
    const onPop = () => setView(readViewState(location.search))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const payload = state.status === 'ready' ? state.payload : null
  const schools = useMemo(() => payload?.schools ?? [], [payload])
  const searched = useMemo(() => searchSchools(schools, view.query), [schools, view.query])
  const visible = useMemo(
    () => sortSchools(filterByCategories(searched, view.categories), view.sort),
    [searched, view.categories, view.sort],
  )
  // Counted against the search, not the category filter, so the numbers do not collapse to the
  // one facet already chosen.
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const school of schools) for (const category of school.categories) counts.set(category.name, 0)
    for (const school of searched) {
      for (const category of school.categories) {
        counts.set(category.name, (counts.get(category.name) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, schools: count }))
      .sort((a, b) => b.schools - a.schools || a.name.localeCompare(b.name))
  }, [schools, searched])

  useEffect(() => {
    if (payload) document.title = payload.title
  }, [payload])

  const setQuery = useCallback((query: string) => setView((v) => ({ ...v, query })), [])
  const setSort = useCallback((sort: SortKey) => setView((v) => ({ ...v, sort })), [])
  const toggleCategory = useCallback(
    (name: string) =>
      setView((v) => ({
        ...v,
        categories: v.categories.includes(name)
          ? v.categories.filter((value) => value !== name)
          : [...v.categories, name],
      })),
    [],
  )
  const reset = useCallback(() => setView((v) => ({ ...v, query: '', categories: [] })), [])

  const totals = payload?.totals ?? { schools: 0, clubs: 0, checkedAge: 'never' }

  return (
    <>
      <Header
        title={payload?.title ?? 'HS Clubs'}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSwitcher={() => setSwitcher(true)}
      />
      <main id="top" className="pb-24 sm:pb-0">
        <Hero totals={totals} schools={schools} />
        <section
          id="directories"
          aria-labelledby="directories-title"
          className="mx-auto w-full max-w-[1200px] scroll-mt-[70px] px-[clamp(1.15rem,4vw,3.5rem)] pb-[clamp(3rem,8vh,5.5rem)] pt-[clamp(1.5rem,4vh,3rem)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-[var(--line)] pb-5">
            <h2 id="directories-title" className="font-display m-0 text-[1.45rem] font-bold tracking-[-0.025em]">
              Directories
            </h2>
            <p className="m-0 text-[0.9rem] text-[var(--text-faint)]">
              Verified schools only &middot; checked {totals.checkedAge}
            </p>
          </div>

          {state.status === 'loading' && <Skeleton />}

          {state.status === 'failed' && (
            <Notice tone="warn">
              Could not load the directories: {state.message}. The poller writes this page&rsquo;s
              data on a schedule; try again in a moment.
            </Notice>
          )}

          {state.status === 'ready' && schools.length === 0 && (
            <Notice>No schools yet. Verify a school and it appears here.</Notice>
          )}

          {state.status === 'ready' && schools.length > 0 && (
            <>
              <Controls
                query={view.query}
                onQuery={setQuery}
                sort={view.sort}
                onSort={setSort}
                categories={categories}
                selected={view.categories}
                onToggleCategory={toggleCategory}
                onClear={reset}
                showing={visible.length}
                total={schools.length}
              />

              {visible.length === 0 ? (
                <Notice>
                  No school matches that.{' '}
                  <button
                    type="button"
                    onClick={reset}
                    className="cursor-pointer text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    Reset the search and filters
                  </button>{' '}
                  to see all {schools.length}.
                </Notice>
              ) : (
                <div
                  className={`mt-7 grid gap-4 ${
                    visible.length === 1
                      ? '[grid-template-columns:minmax(0,37rem)]'
                      : '[grid-template-columns:repeat(auto-fit,minmax(330px,1fr))]'
                  }`}
                >
                  {visible.map((school, index) => (
                    <SchoolCard key={school.slug} school={school} index={index} onOpen={setOpen} />
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
      <SchoolSwitcher schools={schools} open={switcher} onClose={() => setSwitcher(false)} />
      <MobileDock onOpenSwitcher={() => setSwitcher(true)} />
    </>
  )
}
