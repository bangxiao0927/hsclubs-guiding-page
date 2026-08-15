import { SORT_LABELS, type SortKey } from '../filters'

export const Controls = ({
  query,
  onQuery,
  sort,
  onSort,
  categories,
  selected,
  onToggleCategory,
  onClear,
  showing,
  total,
}: {
  query: string
  onQuery: (value: string) => void
  sort: SortKey
  onSort: (value: SortKey) => void
  /** Every category, with how many of the currently searched schools carry it. */
  categories: { name: string; schools: number }[]
  selected: string[]
  onToggleCategory: (name: string) => void
  onClear: () => void
  showing: number
  total: number
}) => {
  const filtered = query.trim().length > 0 || selected.length > 0
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search schools</span>
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          >
            &#9906;
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search by school or host"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2.5 pl-10 pr-3 text-[0.95rem] outline-none transition focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--accent)]/30"
          />
        </label>
        <label className="flex items-center gap-2 text-[0.85rem] text-[var(--text-faint)]">
          Sort
          <select
            value={sort}
            onChange={(event) => onSort(event.target.value as SortKey)}
            className="cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[0.9rem] text-[var(--text)] outline-none transition focus:border-[var(--line-strong)]"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map(({ name, schools }) => {
            const active = selected.includes(name)
            // A category no school in the current search has is a dead end; say so rather than
            // letting someone click their way to an empty page.
            const dead = schools === 0 && !active
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                disabled={dead}
                onClick={() => onToggleCategory(name)}
                className={`rounded-[9px] border px-2.5 py-1 text-[0.78rem] transition ${
                  active
                    ? 'cursor-pointer border-transparent bg-[var(--accent)] text-white'
                    : dead
                      ? 'cursor-not-allowed border-[var(--line)] text-[var(--text-faint)] opacity-40'
                      : 'cursor-pointer border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)]'
                }`}
              >
                {name}
                <span className={`ml-1.5 tabular-nums ${active ? 'text-white/80' : 'text-[var(--text-faint)]'}`}>
                  {schools}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <p className="m-0 text-[0.85rem] text-[var(--text-faint)]">
        {filtered
          ? `Showing ${showing} of ${total} school${total === 1 ? '' : 's'}`
          : `${total} school${total === 1 ? '' : 's'}`}
        {filtered && (
          <button
            type="button"
            onClick={onClear}
            className="ml-2 cursor-pointer text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Reset
          </button>
        )}
      </p>
    </div>
  )
}