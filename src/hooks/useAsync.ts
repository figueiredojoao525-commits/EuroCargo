import { useCallback, useEffect, useMemo, useState, type DependencyList } from 'react'

interface AsyncState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  /** Re-runs the loader; current data stays visible until the new result arrives. */
  reload: () => void
}

/**
 * Runs `load` whenever `deps` change. Results from outdated runs are ignored,
 * and data is never shown for deps other than the ones it was loaded for.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- identity changes exactly when deps change
  const depsKey = useMemo(() => ({}), deps)
  const [reloadCount, setReloadCount] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new token per run
  const runToken = useMemo(() => ({}), [depsKey, reloadCount])
  const [result, setResult] = useState<{ depsKey: object; runToken: object; data?: T; error?: unknown } | null>(null)

  useEffect(() => {
    let active = true
    load().then(
      (data) => active && setResult({ depsKey, runToken, data }),
      (error: unknown) => active && setResult({ depsKey, runToken, error }),
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is re-created every render; runToken tracks deps
  }, [runToken])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  return {
    data: result?.depsKey === depsKey ? result.data : undefined,
    error: result?.runToken === runToken ? result.error : undefined,
    loading: result?.runToken !== runToken,
    reload,
  }
}
