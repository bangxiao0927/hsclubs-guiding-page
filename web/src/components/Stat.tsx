import { useEffect, useRef, useState } from 'react'

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Counts up to a number that is already the component's prop, so a browser that never runs the
 * animation frame still shows the right figure -- the animation is decoration over a value the
 * page already knows.
 */
const useCountUp = (value: number): number => {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0))
  const frame = useRef(0)

  useEffect(() => {
    if (reducedMotion()) {
      setShown(value)
      return
    }
    let start = 0
    const step = (time: number) => {
      if (!start) start = time
      const k = Math.min(1, (time - start) / 900)
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))))
      if (k < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [value])

  return shown
}

export const Stat = ({ label, value }: { label: string; value: number | string }) => {
  const numeric = typeof value === 'number'
  const counted = useCountUp(numeric ? value : 0)
  return (
    <div>
      <p
        className={`font-display m-0 tabular-nums font-extrabold tracking-[-0.035em] ${
          numeric ? 'text-[clamp(1.8rem,3.6vw,2.7rem)]' : 'text-[clamp(1.15rem,2vw,1.55rem)] font-bold'
        }`}
      >
        {numeric ? counted.toLocaleString() : value}
      </p>
      <p className="m-0 mt-0.5 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
        {label}
      </p>
    </div>
  )
}