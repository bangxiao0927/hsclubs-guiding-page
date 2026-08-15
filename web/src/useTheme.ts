import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const stored = (): Theme | null => {
  try {
    const value = localStorage.getItem('theme')
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

const systemTheme = (): Theme =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

/**
 * Reads and writes the same `theme` key the school sites use, so a visitor who has chosen dark
 * over there arrives here already dark. With nothing stored, the system preference wins and no
 * attribute is set at all.
 */
export const useTheme = (): [Theme, () => void] => {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme())

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('theme', next)
      } catch {
        /* private browsing: the choice lasts for this visit only */
      }
      return next
    })
  }, [])

  return [theme, toggle]
}