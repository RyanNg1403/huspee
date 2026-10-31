'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [requestDeps, setRequestDeps] = useState(deps);
  const latest = useRef({ fn, deps });
  const request = useRef({ id: 0 });

  useEffect(() => {
    const previous = latest.current;
    latest.current = { fn, deps };
    if (
      previous.deps.length !== deps.length ||
      deps.some((value, i) => !Object.is(value, previous.deps[i]))
    ) {
      request.current.id++;
      setVersion((value) => value + 1);
    }
  }, [fn, deps]);

  useEffect(() => {
    const current = request.current;
    const id = ++current.id;
    const run = async () => {
      setRequestDeps(latest.current.deps);
      setLoading(true);
      setError(null);
      try {
        const result = await latest.current.fn();
        if (current.id === id) setData(result);
      } catch (caught) {
        if (current.id === id) setError(caught);
      } finally {
        if (current.id === id) setLoading(false);
      }
    };
    void run();
    // Invalidate in-flight work on dependency changes, reload, or unmount.
    return () => {
      current.id++;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const stale =
    requestDeps.length !== deps.length || deps.some((value, i) => !Object.is(value, requestDeps[i]));
  return {
    data: stale ? null : data,
    error: stale ? null : error,
    loading: stale || loading,
    reload,
  };
}
