import { useCallback, useEffect, useState } from 'react'

/**
 * Run an async loader on mount (and when deps change), with a reload().
 * The loader throws a Hebrew message on failure; it becomes `error`.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps)

  useEffect(() => {
    let cancelled = false
    load().then(
      (d) => {
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'משהו השתבש. נסו שוב.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, reload }
}

/** Unwrap a Supabase response, throwing a Hebrew message on error. */
export function must<T>(res: { data: T | null; error: unknown }, message: string): T {
  if (res.error || res.data == null) throw new Error(message)
  return res.data
}
