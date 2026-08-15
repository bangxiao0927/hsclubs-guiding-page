/**
 * A month of club counts as one line.
 *
 * Deliberately unlabelled and inert: it answers "has this directory been moving?" at a glance,
 * and every number behind it is in the drawer. A chart library would be 40kB to draw a polyline.
 */
export const Sparkline = ({
  points,
  className = '',
}: {
  points: { at: string; clubCount: number }[]
  className?: string
}) => {
  if (points.length < 2) return null

  const width = 88
  const height = 24
  const counts = points.map((point) => point.clubCount)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  // A flat line still has to be a line rather than a division by zero.
  const span = max - min || 1
  const step = width / (points.length - 1)
  const path = counts
    .map((count, index) => {
      const x = index * step
      const y = height - ((count - min) / span) * (height - 4) - 2
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path d={path} stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}